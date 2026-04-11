import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  projects,
  equipmentCatalog,
  equipmentTypes,
  rentals,
  invoices,
  activityLogs,
  settings,
  type User,
  type InsertUser,
  type Project,
  type InsertProject,
  type Equipment,
  type InsertEquipment,
  type EquipmentType,
  type InsertEquipmentType,
  type Rental,
  type InsertRental,
  type Invoice,
  type InsertInvoice,
  type ActivityLog,
  type InsertActivityLog,
  type Setting,
  type InsertSetting,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;

  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;

  // Equipment Types (database in settings)
  getEquipmentTypes(): Promise<EquipmentType[]>;
  getEquipmentType(id: string): Promise<EquipmentType | undefined>;
  createEquipmentType(eqType: InsertEquipmentType): Promise<EquipmentType>;
  updateEquipmentType(id: string, eqType: Partial<InsertEquipmentType>): Promise<EquipmentType | undefined>;
  deleteEquipmentType(id: string): Promise<boolean>;

  // Equipment
  getEquipment(): Promise<Equipment[]>;
  getEquipmentById(id: string): Promise<Equipment | undefined>;
  createEquipment(equipment: InsertEquipment): Promise<Equipment>;
  updateEquipment(id: string, equipment: Partial<InsertEquipment>): Promise<Equipment | undefined>;
  deleteEquipment(id: string): Promise<boolean>;

  // Rentals
  getRentals(): Promise<Rental[]>;
  getRental(id: string): Promise<Rental | undefined>;
  getRentalsByProject(projectId: string): Promise<Rental[]>;
  createRental(rental: InsertRental): Promise<Rental>;
  updateRental(id: string, rental: Partial<InsertRental>): Promise<Rental | undefined>;
  deleteRental(id: string): Promise<boolean>;

  // Invoices
  getInvoices(): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  getInvoicesByProject(projectId: string): Promise<Invoice[]>;
  getInvoicesByRental(rentalId: string): Promise<Invoice[]>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  deleteInvoice(id: string): Promise<boolean>;

  // Activity Logs
  getActivityLogs(limit?: number): Promise<ActivityLog[]>;
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;

  // Settings
  getSettings(): Promise<Setting[]>;
  getSetting(key: string): Promise<Setting | undefined>;
  upsertSetting(key: string, value: string): Promise<Setting>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async updateUser(id: string, userData: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ ...userData })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    await db.delete(users).where(eq(users.id, id));
    return true;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined> {
    const [updated] = await db
      .update(projects)
      .set({ ...project, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    const result = await db.delete(projects).where(eq(projects.id, id));
    return true;
  }

  // Equipment Types
  async getEquipmentTypes(): Promise<EquipmentType[]> {
    return db.select().from(equipmentTypes).orderBy(equipmentTypes.name);
  }

  async getEquipmentType(id: string): Promise<EquipmentType | undefined> {
    const [eqType] = await db.select().from(equipmentTypes).where(eq(equipmentTypes.id, id));
    return eqType;
  }

  async createEquipmentType(eqType: InsertEquipmentType): Promise<EquipmentType> {
    const [created] = await db.insert(equipmentTypes).values(eqType).returning();
    return created;
  }

  async updateEquipmentType(id: string, eqType: Partial<InsertEquipmentType>): Promise<EquipmentType | undefined> {
    const [updated] = await db
      .update(equipmentTypes)
      .set(eqType)
      .where(eq(equipmentTypes.id, id))
      .returning();
    return updated;
  }

  async deleteEquipmentType(id: string): Promise<boolean> {
    await db.delete(equipmentTypes).where(eq(equipmentTypes.id, id));
    return true;
  }

  // Equipment
  async getEquipment(): Promise<Equipment[]> {
    return db.select().from(equipmentCatalog).orderBy(equipmentCatalog.name);
  }

  async getEquipmentById(id: string): Promise<Equipment | undefined> {
    const [equipment] = await db.select().from(equipmentCatalog).where(eq(equipmentCatalog.id, id));
    return equipment;
  }

  async createEquipment(equipment: InsertEquipment): Promise<Equipment> {
    const [created] = await db.insert(equipmentCatalog).values(equipment).returning();
    return created;
  }

  async updateEquipment(id: string, equipment: Partial<InsertEquipment>): Promise<Equipment | undefined> {
    const [updated] = await db
      .update(equipmentCatalog)
      .set(equipment)
      .where(eq(equipmentCatalog.id, id))
      .returning();
    return updated;
  }

  async deleteEquipment(id: string): Promise<boolean> {
    await db.delete(equipmentCatalog).where(eq(equipmentCatalog.id, id));
    return true;
  }

  // Rentals
  async getRentals(): Promise<Rental[]> {
    return db.select().from(rentals).orderBy(desc(rentals.createdAt));
  }

  async getRental(id: string): Promise<Rental | undefined> {
    const [rental] = await db.select().from(rentals).where(eq(rentals.id, id));
    return rental;
  }

  async getRentalsByProject(projectId: string): Promise<Rental[]> {
    return db
      .select()
      .from(rentals)
      .where(eq(rentals.projectId, projectId))
      .orderBy(desc(rentals.createdAt));
  }

  async createRental(rental: InsertRental): Promise<Rental> {
    const [created] = await db.insert(rentals).values(rental).returning();
    return created;
  }

  async updateRental(id: string, rental: Partial<InsertRental>): Promise<Rental | undefined> {
    const [updated] = await db
      .update(rentals)
      .set({ ...rental, updatedAt: new Date() })
      .where(eq(rentals.id, id))
      .returning();
    return updated;
  }

  async deleteRental(id: string): Promise<boolean> {
    await db.delete(rentals).where(eq(rentals.id, id));
    return true;
  }

  // Invoices
  async getInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getInvoicesByProject(projectId: string): Promise<Invoice[]> {
    return db
      .select()
      .from(invoices)
      .where(eq(invoices.projectId, projectId))
      .orderBy(desc(invoices.createdAt));
  }

  async getInvoicesByRental(rentalId: string): Promise<Invoice[]> {
    return db
      .select()
      .from(invoices)
      .where(eq(invoices.rentalId, rentalId))
      .orderBy(desc(invoices.createdAt));
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    return created;
  }

  async deleteInvoice(id: string): Promise<boolean> {
    await db.delete(invoices).where(eq(invoices.id, id));
    return true;
  }

  // Activity Logs
  async getActivityLogs(limit: number = 100): Promise<ActivityLog[]> {
    return db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(limit);
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [created] = await db.insert(activityLogs).values(log).returning();
    return created;
  }

  // Settings
  async getSettings(): Promise<Setting[]> {
    return db.select().from(settings);
  }

  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting;
  }

  async upsertSetting(key: string, value: string): Promise<Setting> {
    const existing = await this.getSetting(key);
    if (existing) {
      const [updated] = await db
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, key))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(settings).values({ key, value }).returning();
      return created;
    }
  }
}

export const storage = new DatabaseStorage();
