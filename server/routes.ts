import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import pgSession from "connect-pg-simple";
import multer from "multer";
import puppeteer from "puppeteer";
import { storage } from "./storage";
import { pool } from "./db";
import {
  deleteInvoiceFile,
  downloadInvoiceFile,
  uploadInvoiceFile,
} from "./supabaseStorage";
import {
  insertProjectSchema,
  insertEquipmentSchema,
  insertEquipmentTypeSchema,
  insertRentalSchema,
  insertUserSchema,
} from "@shared/schema";
import {
  requireAuth,
  requireRole,
  canEdit,
  isAdmin,
  hashPassword,
  verifyPassword,
  createDefaultAdmin,
} from "./auth";

const PgSessionStore = pgSession(session);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF, JPG, and PNG are allowed."));
    }
  },
});

function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return value || "";
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  return secret || "equiptrack-dev-session-secret";
}

function calculateProratedCost(monthlyCost: number, startDate: Date, endDate: Date, prorateEnabled: boolean): number {
  if (!prorateEnabled) return monthlyCost;
  
  const startDay = startDate.getDate();
  const endDay = endDate.getDate();
  const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
  
  if (startDay === 1 && endDay === daysInMonth) {
    return monthlyCost;
  }
  
  const daysActive = Math.min(daysInMonth - startDay + 1, daysInMonth);
  return (monthlyCost / daysInMonth) * daysActive;
}

function calculateRentalCostToDate(rental: any): number {
  const monthlyCost = parseFloat(rental.monthlyCost);
  const startDate = new Date(rental.rentalStartDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let endDate: Date;
  if (rental.isOpenContract && rental.contractClosedDate) {
    endDate = new Date(rental.contractClosedDate + "T00:00:00");
  } else if (rental.isOpenContract) {
    endDate = today;
  } else if (rental.returnDate) {
    endDate = new Date(rental.returnDate + "T00:00:00");
  } else {
    endDate = today;
  }

  if (endDate < startDate) return 0;

  const renewalDay = startDate.getDate();
  let renewalCount = 0;
  let checkDate = new Date(startDate);

  while (true) {
    const nextMonth = checkDate.getMonth() + 1;
    const nextYear = checkDate.getFullYear() + (nextMonth > 11 ? 1 : 0);
    const normalizedMonth = nextMonth % 12;
    const daysInNextMonth = new Date(nextYear, normalizedMonth + 1, 0).getDate();
    const actualDay = Math.min(renewalDay, daysInNextMonth);
    const nextRenewal = new Date(nextYear, normalizedMonth, actualDay);

    if (nextRenewal <= endDate) {
      renewalCount++;
      checkDate = nextRenewal;
    } else {
      break;
    }
  }

  const baseCost = renewalCount * monthlyCost;
  const pickup = parseFloat(rental.pickupCost || "0");
  const dropoff = rental.contractClosedDate || rental.returnDate ? parseFloat(rental.dropoffCost || "0") : 0;
  const misc = parseFloat(rental.miscCost || "0");
  const subtotal = baseCost + pickup + dropoff + misc;
  const taxPercent = parseFloat(rental.taxPercent || "0");
  const tax = subtotal * (taxPercent / 100);

  return subtotal + tax;
}

async function getRenewalAlertDays(): Promise<number[]> {
  const settingsList = await storage.getSettings();
  const days: number[] = [];
  
  const alert7 = settingsList.find(s => s.key === "renewal_alert_7_days");
  const alert14 = settingsList.find(s => s.key === "renewal_alert_14_days");
  const alert30 = settingsList.find(s => s.key === "renewal_alert_30_days");
  
  if (alert7?.value === "true") days.push(7);
  if (alert14?.value === "true") days.push(14);
  if (alert30?.value === "true") days.push(30);
  
  return days.length > 0 ? days : [7, 14, 30];
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.set("trust proxy", 1);

  app.use(
    session({
      store: new PgSessionStore({
        pool,
        tableName: "session",
        createTableIfMissing: true,
      }),
      secret: sessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

  await createDefaultAdmin();

  // Auth endpoints
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user || !user.password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValid = await verifyPassword(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      req.session.userId = user.id;
      req.session.role = user.role;

      await storage.createActivityLog({
        action: "login",
        entityType: "user",
        entityId: user.id,
        userId: user.id,
        details: `User ${user.username} logged in`,
      });

      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.fullName,
          role: user.role,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_REGISTRATION !== "true") {
        return res.status(403).json({ error: "Registration is disabled" });
      }

      const { username, password, email, fullName } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({
        username,
        password: passwordHash,
        email: email || null,
        fullName: fullName || username,
        role: "viewer",
      });

      req.session.userId = user.id;
      req.session.role = user.role;

      await storage.createActivityLog({
        action: "registered",
        entityType: "user",
        entityId: user.id,
        userId: user.id,
        details: `User ${user.username} registered`,
      });

      res.status(201).json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.fullName,
          role: user.role,
        },
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session?.userId) {
      return res.json({ user: null });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.json({ user: null });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.fullName || user.username,
        role: user.role,
      },
    });
  });

  app.use("/api", (req: Request, res: Response, next) => {
    if (req.path.startsWith("/auth/")) {
      return next();
    }
    return requireAuth(req, res, next);
  });

  // User management (admin only)
  app.get("/api/users", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const users = await storage.getUsers();
      res.json(users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        name: u.fullName || u.username,
        role: u.role,
        createdAt: u.createdAt,
      })));
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/users", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const { username, fullName, email, password, role } = req.body;
      if (!username || !password || !role) {
        return res.status(400).json({ error: "Username, password, and role are required" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({
        username,
        password: passwordHash,
        email: email || null,
        fullName: fullName || username,
        role,
      });

      await storage.createActivityLog({
        action: "created",
        entityType: "user",
        entityId: user.id,
        userId: req.session.userId,
        details: `Created user: ${user.username}`,
      });

      res.status(201).json({
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.fullName,
        role: user.role,
      });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(400).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const { fullName, email, role, password } = req.body;
      const updates: any = {};
      
      if (fullName !== undefined) updates.fullName = fullName;
      if (email !== undefined) updates.email = email;
      if (role) updates.role = role;
      if (password) updates.password = await hashPassword(password);

      const user = await storage.updateUser(routeParam(req, "id"), updates);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      await storage.createActivityLog({
        action: "updated",
        entityType: "user",
        entityId: user.id,
        userId: req.session.userId,
        details: `Updated user: ${user.username}`,
      });

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.fullName,
        role: user.role,
      });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(400).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      if (routeParam(req, "id") === req.session.userId) {
        return res.status(400).json({ error: "Cannot delete yourself" });
      }

      const user = await storage.getUser(routeParam(req, "id"));
      await storage.deleteUser(routeParam(req, "id"));

      await storage.createActivityLog({
        action: "deleted",
        entityType: "user",
        entityId: routeParam(req, "id"),
        userId: req.session.userId,
        details: `Deleted user: ${user?.username || routeParam(req, "id")}`,
      });

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Dashboard endpoints (authenticated)
  app.get("/api/dashboard/stats", async (req: Request, res: Response) => {
    try {
      const [allRentals, allProjects, settingsList] = await Promise.all([
        storage.getRentals(),
        storage.getProjects(),
        storage.getSettings(),
      ]);

      const prorateEnabled = settingsList.find(s => s.key === "prorate_enabled")?.value === "true";
      const alertDays = await getRenewalAlertDays();
      const maxAlertDays = Math.max(...alertDays);

      const activeRentals = allRentals.filter((r) => r.status === "active");
      const overdueRentals = allRentals.filter((r) => r.status === "overdue");
      const activeProjects = allProjects.filter((p) => p.status === "active");
      const openContracts = allRentals.filter((r) => r.isOpenContract && !r.contractClosedDate && r.status === "active");

      const today = new Date();
      let totalMonthlySpend = 0;

      for (const rental of activeRentals) {
        const cost = parseFloat(rental.monthlyCost);
        if (prorateEnabled) {
          const startDate = new Date(rental.rentalStartDate);
          totalMonthlySpend += calculateProratedCost(cost, startDate, today, prorateEnabled);
        } else {
          totalMonthlySpend += cost;
        }
      }

      let totalCostToDate = 0;
      for (const rental of allRentals) {
        totalCostToDate += calculateRentalCostToDate(rental);
      }

      const renewalsDueSoon = allRentals.filter((r) => {
        if (!r.contractRenewalDate || r.status !== "active") return false;
        const renewalDate = new Date(r.contractRenewalDate);
        const diffDays = Math.ceil((renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7;
      }).length;

      res.json({
        totalMonthlySpend: Math.round(totalMonthlySpend * 100) / 100,
        totalCostToDate: Math.round(totalCostToDate * 100) / 100,
        openContractsCount: openContracts.length,
        activeRentalsCount: activeRentals.length,
        projectsCount: activeProjects.length,
        overdueReturnsCount: overdueRentals.length,
        renewalsDueSoon,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/dashboard/spend-by-project", async (req: Request, res: Response) => {
    try {
      const [allRentals, allProjects, settingsList] = await Promise.all([
        storage.getRentals(),
        storage.getProjects(),
        storage.getSettings(),
      ]);

      const prorateEnabled = settingsList.find(s => s.key === "prorate_enabled")?.value === "true";
      const today = new Date();

      const spendByProject = allProjects.map((project) => {
        const projectRentals = allRentals.filter(
          (r) => r.projectId === project.id
        );
        const activeProjectRentals = projectRentals.filter((r) => r.status === "active");
        
        let totalSpend = 0;
        for (const rental of activeProjectRentals) {
          const cost = parseFloat(rental.monthlyCost);
          if (prorateEnabled) {
            const startDate = new Date(rental.rentalStartDate);
            totalSpend += calculateProratedCost(cost, startDate, today, prorateEnabled);
          } else {
            totalSpend += cost;
          }
        }

        let costToDate = 0;
        for (const rental of projectRentals) {
          costToDate += calculateRentalCostToDate(rental);
        }

        return {
          projectId: project.id,
          projectName: project.name,
          projectCode: project.code,
          totalSpend: Math.round(totalSpend * 100) / 100,
          costToDate: Math.round(costToDate * 100) / 100,
          budget: project.budget ? parseFloat(project.budget) : null,
          activeRentals: activeProjectRentals.length,
          totalRentals: projectRentals.length,
        };
      });

      spendByProject.sort((a, b) => b.costToDate - a.costToDate);
      res.json(spendByProject);
    } catch (error) {
      console.error("Error fetching spend by project:", error);
      res.status(500).json({ error: "Failed to fetch spend by project" });
    }
  });

  app.get("/api/dashboard/monthly-trend", async (req: Request, res: Response) => {
    try {
      const [allRentals, settingsList] = await Promise.all([
        storage.getRentals(),
        storage.getSettings(),
      ]);

      const prorateEnabled = settingsList.find(s => s.key === "prorate_enabled")?.value === "true";
      const today = new Date();
      const months: { month: string; spend: number }[] = [];

      for (let i = 5; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
        const monthName = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        
        const activeInMonth = allRentals.filter((r) => {
          const startDate = new Date(r.rentalStartDate);
          const endDate = r.returnDate ? new Date(r.returnDate) : today;
          return startDate <= monthEnd && endDate >= date;
        });

        let spend = 0;
        for (const rental of activeInMonth) {
          const cost = parseFloat(rental.monthlyCost);
          if (prorateEnabled) {
            const startDate = new Date(rental.rentalStartDate);
            spend += calculateProratedCost(cost, startDate, monthEnd, prorateEnabled);
          } else {
            spend += cost;
          }
        }

        months.push({ month: monthName, spend: Math.round(spend * 100) / 100 });
      }

      res.json(months);
    } catch (error) {
      console.error("Error fetching monthly trend:", error);
      res.status(500).json({ error: "Failed to fetch monthly trend" });
    }
  });

  app.get("/api/dashboard/renewal-alerts", async (req: Request, res: Response) => {
    try {
      const [allRentals, allProjects] = await Promise.all([
        storage.getRentals(),
        storage.getProjects(),
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const alerts = allRentals
        .filter((r) => r.contractRenewalDate && r.status === "active")
        .map((r) => {
          const renewalDate = new Date(r.contractRenewalDate!);
          const diffTime = renewalDate.getTime() - today.getTime();
          const daysUntilRenewal = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const project = allProjects.find((p) => p.id === r.projectId);
          
          return {
            rentalId: r.id,
            equipmentName: r.equipmentName,
            projectName: project?.name || "Unknown",
            renewalDate: r.contractRenewalDate,
            daysUntilRenewal,
          };
        })
        .filter((a) => a.daysUntilRenewal >= 0 && a.daysUntilRenewal <= 7)
        .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal);

      res.json(alerts);
    } catch (error) {
      console.error("Error fetching renewal alerts:", error);
      res.status(500).json({ error: "Failed to fetch renewal alerts" });
    }
  });

  // Projects CRUD
  app.get("/api/projects", async (req: Request, res: Response) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const project = await storage.getProject(routeParam(req, "id"));
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.get("/api/projects/:id/rentals", async (req: Request, res: Response) => {
    try {
      const rentals = await storage.getRentalsByProject(routeParam(req, "id"));
      res.json(rentals);
    } catch (error) {
      console.error("Error fetching project rentals:", error);
      res.status(500).json({ error: "Failed to fetch project rentals" });
    }
  });

  app.get("/api/projects/:id/invoices", async (req: Request, res: Response) => {
    try {
      const invoices = await storage.getInvoicesByProject(routeParam(req, "id"));
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching project invoices:", error);
      res.status(500).json({ error: "Failed to fetch project invoices" });
    }
  });

  app.post("/api/projects", requireRole("admin", "manager"), async (req: Request, res: Response) => {
    try {
      const data = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(data);
      await storage.createActivityLog({
        action: "created",
        entityType: "project",
        entityId: project.id,
        userId: req.session.userId,
        details: `Created project: ${project.name}`,
      });
      res.status(201).json(project);
    } catch (error: any) {
      console.error("Error creating project:", error);
      if (error?.code === '23505') {
        res.status(400).json({ error: "A project with this code already exists" });
      } else if (error?.issues) {
        res.status(400).json({ error: error.issues.map((i: any) => i.message).join(', ') });
      } else {
        res.status(400).json({ error: "Failed to create project" });
      }
    }
  });

  app.patch("/api/projects/:id", requireRole("admin", "manager"), async (req: Request, res: Response) => {
    try {
      const validFields = ["name", "code", "status", "address", "startDate", "endDate", "notes"];
      const updates: any = {};
      for (const field of validFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      const project = await storage.updateProject(routeParam(req, "id"), updates);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      await storage.createActivityLog({
        action: "updated",
        entityType: "project",
        entityId: project.id,
        userId: req.session.userId,
        details: `Updated project: ${project.name}`,
      });
      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(400).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const project = await storage.getProject(routeParam(req, "id"));
      await storage.deleteProject(routeParam(req, "id"));
      await storage.createActivityLog({
        action: "deleted",
        entityType: "project",
        entityId: routeParam(req, "id"),
        userId: req.session.userId,
        details: `Deleted project: ${project?.name || routeParam(req, "id")}`,
      });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Equipment Types CRUD (managed in Settings)
  app.get("/api/equipment-types", async (req: Request, res: Response) => {
    try {
      const types = await storage.getEquipmentTypes();
      res.json(types);
    } catch (error) {
      console.error("Error fetching equipment types:", error);
      res.status(500).json({ error: "Failed to fetch equipment types" });
    }
  });

  app.post("/api/equipment-types", requireRole("admin", "manager"), async (req: Request, res: Response) => {
    try {
      const data = insertEquipmentTypeSchema.parse(req.body);
      const eqType = await storage.createEquipmentType(data);
      await storage.createActivityLog({
        action: "created",
        entityType: "equipment_type",
        entityId: eqType.id,
        userId: req.session.userId,
        details: `Added equipment type: ${eqType.name}`,
      });
      res.status(201).json(eqType);
    } catch (error) {
      console.error("Error creating equipment type:", error);
      res.status(400).json({ error: "Failed to create equipment type" });
    }
  });

  app.patch("/api/equipment-types/:id", requireRole("admin", "manager"), async (req: Request, res: Response) => {
    try {
      const validFields = ["name", "weeklyCost", "fourWeekCost", "pickupCost", "dropoffCost", "taxPercent"];
      const updates: any = {};
      for (const field of validFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      const eqType = await storage.updateEquipmentType(routeParam(req, "id"), updates);
      if (!eqType) {
        return res.status(404).json({ error: "Equipment type not found" });
      }
      await storage.createActivityLog({
        action: "updated",
        entityType: "equipment_type",
        entityId: eqType.id,
        userId: req.session.userId,
        details: `Updated equipment type: ${eqType.name}`,
      });
      res.json(eqType);
    } catch (error) {
      console.error("Error updating equipment type:", error);
      res.status(400).json({ error: "Failed to update equipment type" });
    }
  });

  app.delete("/api/equipment-types/:id", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const eqType = await storage.getEquipmentType(routeParam(req, "id"));
      await storage.deleteEquipmentType(routeParam(req, "id"));
      await storage.createActivityLog({
        action: "deleted",
        entityType: "equipment_type",
        entityId: routeParam(req, "id"),
        userId: req.session.userId,
        details: `Deleted equipment type: ${eqType?.name || routeParam(req, "id")}`,
      });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting equipment type:", error);
      res.status(500).json({ error: "Failed to delete equipment type" });
    }
  });

  // Equipment CRUD
  app.get("/api/equipment", async (req: Request, res: Response) => {
    try {
      const equipment = await storage.getEquipment();
      res.json(equipment);
    } catch (error) {
      console.error("Error fetching equipment:", error);
      res.status(500).json({ error: "Failed to fetch equipment" });
    }
  });

  app.post("/api/equipment", requireRole("admin", "manager"), async (req: Request, res: Response) => {
    try {
      const data = insertEquipmentSchema.parse(req.body);
      const equipment = await storage.createEquipment(data);
      await storage.createActivityLog({
        action: "created",
        entityType: "equipment",
        entityId: equipment.id,
        userId: req.session.userId,
        details: `Added equipment: ${equipment.name}`,
      });
      res.status(201).json(equipment);
    } catch (error) {
      console.error("Error creating equipment:", error);
      res.status(400).json({ error: "Failed to create equipment" });
    }
  });

  app.patch("/api/equipment/:id", requireRole("admin", "manager"), async (req: Request, res: Response) => {
    try {
      const validFields = ["name", "type", "baseMonthlyCost", "weeklyCost", "fourWeekCost", "pickupCost", "dropoffCost", "taxPercent", "miscCost", "miscDescription", "vendor", "notes"];
      const updates: any = {};
      for (const field of validFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      const equipment = await storage.updateEquipment(routeParam(req, "id"), updates);
      if (!equipment) {
        return res.status(404).json({ error: "Equipment not found" });
      }
      await storage.createActivityLog({
        action: "updated",
        entityType: "equipment",
        entityId: equipment.id,
        userId: req.session.userId,
        details: `Updated equipment: ${equipment.name}`,
      });
      res.json(equipment);
    } catch (error) {
      console.error("Error updating equipment:", error);
      res.status(400).json({ error: "Failed to update equipment" });
    }
  });

  app.delete("/api/equipment/:id", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const equipment = await storage.getEquipmentById(routeParam(req, "id"));
      const allRentals = await storage.getRentals();
      const linkedRentals = allRentals.filter(r => r.equipmentId === routeParam(req, "id"));
      if (linkedRentals.length > 0) {
        const activeCount = linkedRentals.filter(r => r.status === "active").length;
        const msg = activeCount > 0
          ? `Cannot delete this equipment because it has ${activeCount} active rental(s). Remove or reassign the rentals first.`
          : `Cannot delete this equipment because it is referenced by ${linkedRentals.length} rental(s). Remove the rentals first.`;
        return res.status(400).json({ error: msg });
      }
      await storage.deleteEquipment(routeParam(req, "id"));
      await storage.createActivityLog({
        action: "deleted",
        entityType: "equipment",
        entityId: routeParam(req, "id"),
        userId: req.session.userId,
        details: `Deleted equipment: ${equipment?.name || routeParam(req, "id")}`,
      });
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting equipment:", error);
      if (error?.code === "23503") {
        res.status(400).json({ error: "Cannot delete this equipment because it is linked to existing rentals. Remove the rentals first." });
      } else {
        res.status(500).json({ error: "Failed to delete equipment" });
      }
    }
  });

  // Rentals CRUD
  app.get("/api/rentals", async (req: Request, res: Response) => {
    try {
      const rentals = await storage.getRentals();
      res.json(rentals);
    } catch (error) {
      console.error("Error fetching rentals:", error);
      res.status(500).json({ error: "Failed to fetch rentals" });
    }
  });

  app.post("/api/rentals", requireRole("admin", "manager"), async (req: Request, res: Response) => {
    try {
      const data = insertRentalSchema.parse(req.body);
      const rental = await storage.createRental(data);
      await storage.createActivityLog({
        action: "created",
        entityType: "rental",
        entityId: rental.id,
        userId: req.session.userId,
        details: `Created rental: ${rental.equipmentName}`,
      });
      res.status(201).json(rental);
    } catch (error) {
      console.error("Error creating rental:", error);
      res.status(400).json({ error: "Failed to create rental" });
    }
  });

  app.patch("/api/rentals/:id", requireRole("admin", "manager"), async (req: Request, res: Response) => {
    try {
      const validFields = ["projectId", "equipmentId", "equipmentName", "equipmentType", "vendor", 
                          "rentalStartDate", "returnDate", "contractRenewalDate", "monthlyCost", "weeklyCost",
                          "pickupCost", "dropoffCost", "taxPercent", "miscCost", "miscDescription",
                          "isOpenContract", "contractClosedDate", "status", "notes"];
      const updates: any = {};
      for (const field of validFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      const rental = await storage.updateRental(routeParam(req, "id"), updates);
      if (!rental) {
        return res.status(404).json({ error: "Rental not found" });
      }
      await storage.createActivityLog({
        action: "updated",
        entityType: "rental",
        entityId: rental.id,
        userId: req.session.userId,
        details: `Updated rental: ${rental.equipmentName}`,
      });
      res.json(rental);
    } catch (error) {
      console.error("Error updating rental:", error);
      res.status(400).json({ error: "Failed to update rental" });
    }
  });

  app.post("/api/rentals/:id/close-contract", requireRole("admin", "manager"), async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRental(routeParam(req, "id"));
      if (!rental) {
        return res.status(404).json({ error: "Rental not found" });
      }
      if (!rental.isOpenContract) {
        return res.status(400).json({ error: "Rental is not an open contract" });
      }

      const closedDate = new Date().toISOString().split("T")[0];
      const updated = await storage.updateRental(routeParam(req, "id"), {
        isOpenContract: false,
        contractClosedDate: closedDate,
        status: "returned",
      });

      await storage.createActivityLog({
        action: "closed_contract",
        entityType: "rental",
        entityId: routeParam(req, "id"),
        userId: req.session.userId,
        details: `Closed open contract for: ${rental.equipmentName}`,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error closing contract:", error);
      res.status(500).json({ error: "Failed to close contract" });
    }
  });

  app.delete("/api/rentals/:id", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const rental = await storage.getRental(routeParam(req, "id"));
      await storage.deleteRental(routeParam(req, "id"));
      await storage.createActivityLog({
        action: "deleted",
        entityType: "rental",
        entityId: routeParam(req, "id"),
        userId: req.session.userId,
        details: `Deleted rental: ${rental?.equipmentName || routeParam(req, "id")}`,
      });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting rental:", error);
      res.status(500).json({ error: "Failed to delete rental" });
    }
  });

  // Invoices
  app.get("/api/invoices", async (req: Request, res: Response) => {
    try {
      const invoices = await storage.getInvoices();
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  app.post("/api/invoices/upload", requireRole("admin", "manager"), upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { rentalId, projectId, invoiceDate, invoiceNumber, amount, coveragePeriodStart, coveragePeriodEnd } = req.body;

      if (!rentalId || !projectId || !invoiceDate) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const filePath = await uploadInvoiceFile(req.file);
      const invoice = await storage.createInvoice({
        rentalId,
        projectId,
        fileName: req.file.originalname,
        filePath,
        fileType: req.file.mimetype,
        invoiceDate,
        invoiceNumber: invoiceNumber || null,
        amount: amount || null,
        coveragePeriodStart: coveragePeriodStart || null,
        coveragePeriodEnd: coveragePeriodEnd || null,
      });

      await storage.createActivityLog({
        action: "uploaded",
        entityType: "invoice",
        entityId: invoice.id,
        userId: req.session.userId,
        details: `Uploaded invoice: ${invoice.fileName}`,
      });

      res.status(201).json(invoice);
    } catch (error) {
      console.error("Error uploading invoice:", error);
      res.status(400).json({ error: "Failed to upload invoice" });
    }
  });

  app.get("/api/invoices/:id/download", async (req: Request, res: Response) => {
    try {
      const invoice = await storage.getInvoice(routeParam(req, "id"));
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const file = await downloadInvoiceFile(invoice.filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const isAttachment = req.query.attachment === "true";
      res.setHeader("Content-Type", invoice.fileType);
      if (isAttachment) {
        res.setHeader("Content-Disposition", `attachment; filename="${invoice.fileName}"`);
      }
      res.send(file);
    } catch (error) {
      console.error("Error downloading invoice:", error);
      res.status(500).json({ error: "Failed to download invoice" });
    }
  });

  app.delete("/api/invoices/:id", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const invoice = await storage.getInvoice(routeParam(req, "id"));
      if (invoice) {
        await deleteInvoiceFile(invoice.filePath);
      }
      await storage.deleteInvoice(routeParam(req, "id"));
      await storage.createActivityLog({
        action: "deleted",
        entityType: "invoice",
        entityId: routeParam(req, "id"),
        userId: req.session.userId,
        details: `Deleted invoice: ${invoice?.fileName || routeParam(req, "id")}`,
      });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting invoice:", error);
      res.status(500).json({ error: "Failed to delete invoice" });
    }
  });

  // Settings
  app.get("/api/settings", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const { key, value } = req.body;
      if (!key || value === undefined) {
        return res.status(400).json({ error: "Key and value are required" });
      }
      const setting = await storage.upsertSetting(key, value);
      
      await storage.createActivityLog({
        action: "updated",
        entityType: "setting",
        entityId: key,
        userId: req.session.userId,
        details: `Updated setting: ${key} = ${value}`,
      });

      res.json(setting);
    } catch (error) {
      console.error("Error updating setting:", error);
      res.status(400).json({ error: "Failed to update setting" });
    }
  });

  // Activity Logs
  app.get("/api/activity-logs", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getActivityLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ error: "Failed to fetch activity logs" });
    }
  });

  // Reports with real PDF generation
  app.get("/api/reports/:type/pdf", async (req: Request, res: Response) => {
    try {
      const type = routeParam(req, "type");
      const { dateFrom, dateTo, projectId } = req.query;

      const [projects, rentals, invoices, settingsList] = await Promise.all([
        storage.getProjects(),
        storage.getRentals(),
        storage.getInvoices(),
        storage.getSettings(),
      ]);

      const prorateEnabled = settingsList.find(s => s.key === "prorate_enabled")?.value === "true";
      const today = new Date();

      let filteredRentals = rentals;
      let filteredInvoices = invoices;

      if (projectId && projectId !== "all") {
        filteredRentals = rentals.filter((r) => r.projectId === projectId);
        filteredInvoices = invoices.filter((i) => i.projectId === projectId);
      }

      if (dateFrom) {
        const fromDate = new Date(dateFrom as string);
        filteredRentals = filteredRentals.filter((r) => new Date(r.rentalStartDate) >= fromDate);
        filteredInvoices = filteredInvoices.filter((i) => new Date(i.invoiceDate) >= fromDate);
      }

      if (dateTo) {
        const toDate = new Date(dateTo as string);
        filteredRentals = filteredRentals.filter((r) => new Date(r.rentalStartDate) <= toDate);
        filteredInvoices = filteredInvoices.filter((i) => new Date(i.invoiceDate) <= toDate);
      }

      let totalMonthlySpend = 0;
      for (const rental of filteredRentals.filter((r) => r.status === "active")) {
        const cost = parseFloat(rental.monthlyCost);
        if (prorateEnabled) {
          const startDate = new Date(rental.rentalStartDate);
          totalMonthlySpend += calculateProratedCost(cost, startDate, today, prorateEnabled);
        } else {
          totalMonthlySpend += cost;
        }
      }

      const totalInvoiced = filteredInvoices.reduce(
        (sum, inv) => sum + (inv.amount ? parseFloat(inv.amount) : 0),
        0
      );

      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>EquipTrack Report - ${type}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { color: #1a56db; border-bottom: 2px solid #1a56db; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 30px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
    .stat { background: #f3f4f6; padding: 20px; border-radius: 8px; }
    .stat-label { font-size: 12px; color: #6b7280; }
    .stat-value { font-size: 24px; font-weight: bold; color: #111827; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    .footer { margin-top: 40px; text-align: center; color: #9ca3af; font-size: 12px; }
    .proration-note { background: #fef3c7; padding: 10px; border-radius: 4px; margin: 10px 0; font-size: 12px; }
  </style>
</head>
<body>
  <h1>EquipTrack ${type === "executive" ? "Executive Summary" : type === "project" ? "Project Report" : "Rental Details"}</h1>
  <p>Generated: ${new Date().toLocaleDateString()}</p>
  ${prorateEnabled ? '<p class="proration-note">Note: Costs include prorated calculations based on rental start dates.</p>' : ''}
  
  <div class="stats">
    <div class="stat">
      <div class="stat-label">Monthly Spend${prorateEnabled ? " (Prorated)" : ""}</div>
      <div class="stat-value">$${totalMonthlySpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Active Rentals</div>
      <div class="stat-value">${filteredRentals.filter((r) => r.status === "active").length}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total Invoiced</div>
      <div class="stat-value">$${totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
  </div>

  ${type === "project" ? `
  <h2>Projects Summary</h2>
  <table>
    <thead>
      <tr>
        <th>Code</th>
        <th>Name</th>
        <th>Status</th>
        <th>Active Rentals</th>
        <th>Monthly Spend</th>
      </tr>
    </thead>
    <tbody>
      ${projects.map((p) => {
        const projectRentals = filteredRentals.filter((r) => r.projectId === p.id);
        const activeRentals = projectRentals.filter((r) => r.status === "active");
        let spend = 0;
        for (const rental of activeRentals) {
          const cost = parseFloat(rental.monthlyCost);
          if (prorateEnabled) {
            const startDate = new Date(rental.rentalStartDate);
            spend += calculateProratedCost(cost, startDate, today, prorateEnabled);
          } else {
            spend += cost;
          }
        }
        return `
        <tr>
          <td>${p.code}</td>
          <td>${p.name}</td>
          <td>${p.status}</td>
          <td>${activeRentals.length}</td>
          <td>$${spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
        `;
      }).join("")}
    </tbody>
  </table>
  ` : ""}

  ${type === "rental" ? `
  <h2>Rental Details</h2>
  <table>
    <thead>
      <tr>
        <th>Equipment</th>
        <th>Type</th>
        <th>Project</th>
        <th>Start Date</th>
        <th>Status</th>
        <th>Monthly Cost</th>
      </tr>
    </thead>
    <tbody>
      ${filteredRentals.map((r) => {
        const project = projects.find((p) => p.id === r.projectId);
        return `
        <tr>
          <td>${r.equipmentName}</td>
          <td>${r.equipmentType}</td>
          <td>${project?.code || "N/A"}</td>
          <td>${new Date(r.rentalStartDate).toLocaleDateString()}</td>
          <td>${r.status}</td>
          <td>$${parseFloat(r.monthlyCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
        `;
      }).join("")}
    </tbody>
  </table>
  ` : ""}

  <div class="footer">
    <p>EquipTrack - Equipment Rental Management System</p>
  </div>
</body>
</html>
      `;

      const format = req.query.format || "pdf";
      
      if (format === "html") {
        res.setHeader("Content-Type", "text/html");
        return res.send(html);
      }

      try {
        const browser = await puppeteer.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
        });
        await browser.close();

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="equiptrack-${type}-report.pdf"`);
        res.send(pdf);
      } catch (pdfError) {
        console.error("PDF generation error, falling back to HTML:", pdfError);
        res.setHeader("Content-Type", "text/html");
        res.send(html);
      }
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // CSV export
  app.get("/api/reports/:type/csv", async (req: Request, res: Response) => {
    try {
      const type = routeParam(req, "type");
      const { dateFrom, dateTo, projectId } = req.query;

      const [projects, rentals, invoices] = await Promise.all([
        storage.getProjects(),
        storage.getRentals(),
        storage.getInvoices(),
      ]);

      let filteredRentals = rentals;

      if (projectId && projectId !== "all") {
        filteredRentals = rentals.filter((r) => r.projectId === projectId);
      }

      if (dateFrom) {
        const fromDate = new Date(dateFrom as string);
        filteredRentals = filteredRentals.filter((r) => new Date(r.rentalStartDate) >= fromDate);
      }

      if (dateTo) {
        const toDate = new Date(dateTo as string);
        filteredRentals = filteredRentals.filter((r) => new Date(r.rentalStartDate) <= toDate);
      }

      let csv = "";

      if (type === "project") {
        csv = "Code,Name,Status,Active Rentals,Monthly Spend\n";
        for (const p of projects) {
          const projectRentals = filteredRentals.filter((r) => r.projectId === p.id);
          const activeRentals = projectRentals.filter((r) => r.status === "active");
          const spend = activeRentals.reduce((sum, r) => sum + parseFloat(r.monthlyCost), 0);
          csv += `"${p.code}","${p.name}","${p.status}",${activeRentals.length},${spend}\n`;
        }
      } else if (type === "rental") {
        csv = "Equipment,Type,Project,Vendor,Start Date,Return Date,Status,Monthly Cost\n";
        for (const r of filteredRentals) {
          const project = projects.find((p) => p.id === r.projectId);
          csv += `"${r.equipmentName}","${r.equipmentType}","${project?.code || "N/A"}","${r.vendor}","${r.rentalStartDate}","${r.returnDate || ""}","${r.status}",${r.monthlyCost}\n`;
        }
      } else {
        const totalMonthlySpend = filteredRentals
          .filter((r) => r.status === "active")
          .reduce((sum, r) => sum + parseFloat(r.monthlyCost), 0);

        csv = "Metric,Value\n";
        csv += `"Total Monthly Spend",${totalMonthlySpend}\n`;
        csv += `"Active Rentals",${filteredRentals.filter((r) => r.status === "active").length}\n`;
        csv += `"Total Rentals",${filteredRentals.length}\n`;
        csv += `"Active Projects",${projects.filter((p) => p.status === "active").length}\n`;
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="equiptrack-${type}-report.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Error generating CSV:", error);
      res.status(500).json({ error: "Failed to generate CSV" });
    }
  });

  return httpServer;
}
