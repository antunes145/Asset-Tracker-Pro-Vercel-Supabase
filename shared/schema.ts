import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, date, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["admin", "manager", "viewer"]);
export const projectStatusEnum = pgEnum("project_status", ["active", "completed", "on_hold", "cancelled"]);
export const rentalStatusEnum = pgEnum("rental_status", ["active", "returned", "overdue", "pending"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  fullName: text("full_name"),
  role: userRoleEnum("role").notNull().default("viewer"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  status: projectStatusEnum("status").notNull().default("active"),
  address: text("address"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  budget: decimal("budget", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const equipmentTypes = pgTable("equipment_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  weeklyCost: decimal("weekly_cost", { precision: 10, scale: 2 }).notNull(),
  fourWeekCost: decimal("four_week_cost", { precision: 10, scale: 2 }).notNull(),
  pickupCost: decimal("pickup_cost", { precision: 10, scale: 2 }).default("0"),
  dropoffCost: decimal("dropoff_cost", { precision: 10, scale: 2 }).default("0"),
  taxPercent: decimal("tax_percent", { precision: 5, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const equipmentCatalog = pgTable("equipment_catalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(),
  baseMonthlyCost: decimal("base_monthly_cost", { precision: 10, scale: 2 }).notNull(),
  weeklyCost: decimal("weekly_cost", { precision: 10, scale: 2 }),
  fourWeekCost: decimal("four_week_cost", { precision: 10, scale: 2 }),
  pickupCost: decimal("pickup_cost", { precision: 10, scale: 2 }).default("0"),
  dropoffCost: decimal("dropoff_cost", { precision: 10, scale: 2 }).default("0"),
  taxPercent: decimal("tax_percent", { precision: 5, scale: 2 }).default("0"),
  miscCost: decimal("misc_cost", { precision: 10, scale: 2 }).default("0"),
  miscDescription: text("misc_description"),
  vendor: text("vendor"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const rentals = pgTable("rentals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  equipmentId: varchar("equipment_id").references(() => equipmentCatalog.id),
  equipmentName: text("equipment_name").notNull(),
  equipmentNumber: text("equipment_number"),
  equipmentType: text("equipment_type").notNull(),
  vendor: text("vendor"),
  rentalStartDate: date("rental_start_date").notNull(),
  returnDate: date("return_date"),
  contractRenewalDate: date("contract_renewal_date"),
  monthlyCost: decimal("monthly_cost", { precision: 10, scale: 2 }).notNull(),
  weeklyCost: decimal("weekly_cost", { precision: 10, scale: 2 }),
  pickupCost: decimal("pickup_cost", { precision: 10, scale: 2 }).default("0"),
  dropoffCost: decimal("dropoff_cost", { precision: 10, scale: 2 }).default("0"),
  taxPercent: decimal("tax_percent", { precision: 5, scale: 2 }).default("0"),
  miscCost: decimal("misc_cost", { precision: 10, scale: 2 }).default("0"),
  miscDescription: text("misc_description"),
  isOpenContract: boolean("is_open_contract").default(false),
  contractClosedDate: date("contract_closed_date"),
  status: rentalStatusEnum("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rentalId: varchar("rental_id").notNull().references(() => rentals.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileType: text("file_type").notNull(),
  invoiceDate: date("invoice_date").notNull(),
  invoiceNumber: text("invoice_number"),
  amount: decimal("amount", { precision: 10, scale: 2 }),
  coveragePeriodStart: date("coverage_period_start"),
  coveragePeriodEnd: date("coverage_period_end"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEquipmentTypeSchema = createInsertSchema(equipmentTypes).omit({ id: true, createdAt: true });
export const insertEquipmentSchema = createInsertSchema(equipmentCatalog).omit({ id: true, createdAt: true });
export const insertRentalSchema = createInsertSchema(rentals).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export const insertSettingSchema = createInsertSchema(settings).omit({ id: true, updatedAt: true });

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export type InsertEquipmentType = z.infer<typeof insertEquipmentTypeSchema>;
export type EquipmentType = typeof equipmentTypes.$inferSelect;

export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type Equipment = typeof equipmentCatalog.$inferSelect;

export type InsertRental = z.infer<typeof insertRentalSchema>;
export type Rental = typeof rentals.$inferSelect;

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

// Extended types for frontend
export type RentalWithProject = Rental & { project?: Project };
export type InvoiceWithDetails = Invoice & { rental?: Rental; project?: Project };

// Dashboard types
export interface DashboardStats {
  totalMonthlySpend: number;
  totalCostToDate: number;
  openContractsCount: number;
  activeRentalsCount: number;
  projectsCount: number;
  overdueReturnsCount: number;
  renewalsDueSoon: number;
}

export interface SpendByProject {
  projectId: string;
  projectName: string;
  projectCode: string;
  totalSpend: number;
}

export interface MonthlySpendTrend {
  month: string;
  spend: number;
}

export interface RenewalAlert {
  rentalId: string;
  equipmentName: string;
  projectName: string;
  renewalDate: string;
  daysUntilRenewal: number;
}
