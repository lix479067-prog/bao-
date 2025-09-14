import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Telegram users with role management
export const telegramUsers = pgTable("telegram_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  telegramId: varchar("telegram_id").notNull().unique(),
  username: varchar("username"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  role: varchar("role").notNull().default("employee"), // "admin" or "employee"
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Order types enum
export const orderTypeEnum = pgEnum("order_type", ["deposit", "withdrawal", "refund"]);
export const orderStatusEnum = pgEnum("order_status", ["pending", "approved", "rejected"]);

// Orders table
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: varchar("order_number").notNull().unique(),
  type: orderTypeEnum("type").notNull(),
  status: orderStatusEnum("status").notNull().default("pending"),
  telegramUserId: varchar("telegram_user_id").notNull(),
  amount: varchar("amount").notNull(),
  description: text("description"),
  templateData: jsonb("template_data"), // Store form data as JSON
  approvedBy: varchar("approved_by"), // Admin who approved/rejected
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Bot configuration
export const botConfig = pgTable("bot_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  botToken: varchar("bot_token").notNull(),
  webhookUrl: varchar("webhook_url"),
  adminGroupId: varchar("admin_group_id").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Inline keyboard configuration
export const keyboardButtons = pgTable("keyboard_buttons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  text: varchar("text").notNull(),
  callbackData: varchar("callback_data").notNull(),
  orderType: orderTypeEnum("order_type").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Report templates
export const reportTemplates = pgTable("report_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  type: orderTypeEnum("type").notNull(),
  template: text("template").notNull(), // Template with placeholders
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// System settings
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Employee activation codes
export const employeeCodes = pgTable("employee_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code").notNull().unique(), // 6-8位随机码
  name: varchar("name").notNull(), // 员工名称
  type: varchar("type").notNull().default("employee"), // 'employee' or 'admin' - 员工码或管理员工码
  isUsed: boolean("is_used").notNull().default(false),
  usedBy: varchar("used_by"), // Telegram user ID who used this code
  expiresAt: timestamp("expires_at").notNull(), // 15分钟后过期
  createdAt: timestamp("created_at").defaultNow(),
  usedAt: timestamp("used_at"),
});

// Admin group settings
export const adminGroups = pgTable("admin_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull().unique(), // Telegram group ID
  activationCode: varchar("activation_code").notNull(), // 4位激活码
  isActive: boolean("is_active").notNull().default(true),
  activatedAt: timestamp("activated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const ordersRelations = relations(orders, ({ one }) => ({
  telegramUser: one(telegramUsers, {
    fields: [orders.telegramUserId],
    references: [telegramUsers.id],
  }),
  approvedByUser: one(telegramUsers, {
    fields: [orders.approvedBy],
    references: [telegramUsers.id],
  }),
}));

export const telegramUsersRelations = relations(telegramUsers, ({ many }) => ({
  orders: many(orders),
  approvedOrders: many(orders),
}));

// Insert schemas
export const insertTelegramUserSchema = createInsertSchema(telegramUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmployeeCodeSchema = createInsertSchema(employeeCodes).omit({
  id: true,
  createdAt: true,
  usedAt: true,
});

export const insertAdminGroupSchema = createInsertSchema(adminGroups).omit({
  id: true,
  createdAt: true,
  activatedAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  orderNumber: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBotConfigSchema = createInsertSchema(botConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKeyboardButtonSchema = createInsertSchema(keyboardButtons).omit({
  id: true,
  createdAt: true,
});

export const insertReportTemplateSchema = createInsertSchema(reportTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  id: true,
  updatedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type TelegramUser = typeof telegramUsers.$inferSelect;
export type InsertTelegramUser = z.infer<typeof insertTelegramUserSchema>;
export type EmployeeCode = typeof employeeCodes.$inferSelect;
export type InsertEmployeeCode = z.infer<typeof insertEmployeeCodeSchema>;
export type CodeType = "employee" | "admin";
export type AdminGroup = typeof adminGroups.$inferSelect;
export type InsertAdminGroup = z.infer<typeof insertAdminGroupSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type BotConfig = typeof botConfig.$inferSelect;
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type KeyboardButton = typeof keyboardButtons.$inferSelect;
export type InsertKeyboardButton = z.infer<typeof insertKeyboardButtonSchema>;
export type ReportTemplate = typeof reportTemplates.$inferSelect;
export type InsertReportTemplate = z.infer<typeof insertReportTemplateSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;

// Fixed activation code for admin groups (stored in system settings)
export const ADMIN_GROUP_ACTIVATION_KEY = "admin_group_activation_code";
export const DEFAULT_ADMIN_ACTIVATION_CODE = "8888"; // 默认4位激活码
