import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import type { User } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    role?: string;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!roles.includes(req.session.role || "")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

export function canEdit(req: Request): boolean {
  const role = req.session?.role;
  return role === "admin" || role === "manager";
}

export function isAdmin(req: Request): boolean {
  return req.session?.role === "admin";
}

export function isViewer(req: Request): boolean {
  return req.session?.role === "viewer";
}

export async function createDefaultAdmin(): Promise<void> {
  try {
    const users = await storage.getUsers();
    if (users.length === 0) {
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (process.env.NODE_ENV === "production" && !adminPassword) {
        console.warn("No users found and ADMIN_PASSWORD is not set; skipping default admin creation.");
        return;
      }

      const password = adminPassword || "admin123";
      const passwordHash = await hashPassword(password);
      await storage.createUser({
        username: "admin",
        password: passwordHash,
        email: "admin@equiptrack.com",
        fullName: "Admin User",
        role: "admin",
      });
      console.log(
        adminPassword
          ? "Created default admin user from ADMIN_PASSWORD"
          : "Created default development admin user: admin / admin123",
      );
    }
  } catch (error) {
    console.error("Error creating default admin:", error);
  }
}
