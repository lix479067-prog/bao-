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
export const orderStatusEnum = pgEnum("order_status", ["pending", "approved", "rejected", "modifying", "approved_modified"]);
export const extractionStatusEnum = pgEnum("extraction_status", ["pending", "success", "failed"]);

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
  // Order modification fields
  approvalMethod: varchar("approval_method"), // "group_chat", "bot_panel", "web_dashboard"
  isModified: boolean("is_modified").notNull().default(false),
  originalContent: text("original_content"), // Original employee submission
  modifiedContent: text("modified_content"), // Admin modifications
  modificationTime: timestamp("modification_time"),
  groupMessageId: varchar("group_message_id"), // For editing group chat approval messages
  // Customer and project analysis fields
  customerName: varchar("customer_name"), // Customer name parsed from template
  projectName: varchar("project_name"), // Project name parsed from template
  amountExtracted: varchar("amount_extracted"), // Amount value parsed from template
  extractionStatus: extractionStatusEnum("extraction_status").default("pending"), // Parsing status
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_orders_customer_name").on(table.customerName),
  index("IDX_orders_project_name").on(table.projectName),
  index("IDX_orders_extraction_status").on(table.extractionStatus),
  index("IDX_orders_created_at").on(table.createdAt),
]);

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


// Admin group settings
export const adminGroups = pgTable("admin_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull().unique(), // Telegram group ID
  activationCode: varchar("activation_code").notNull(), // 4位激活码
  isActive: boolean("is_active").notNull().default(true),
  activatedAt: timestamp("activated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Telegram update deduplication table for cross-process duplicate prevention
export const telegramUpdateCache = pgTable("telegram_update_cache", {
  updateId: integer("update_id").primaryKey(), // Telegram update_id
  processId: varchar("process_id"), // Process PID for tracking
  instanceId: varchar("instance_id"), // Instance UUID for tracking
  processedAt: timestamp("processed_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // TTL for automatic cleanup
}, (table) => [
  index("IDX_telegram_update_expires").on(table.expiresAt),
]);

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
export type ApprovalMethod = "group_chat" | "bot_panel" | "web_dashboard";
export type OrderStatus = "pending" | "approved" | "rejected" | "modifying" | "approved_modified";
export type ExtractionStatus = "pending" | "success" | "failed";
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

// Fixed activation codes (stored in system settings)
export const ADMIN_GROUP_ACTIVATION_KEY = "admin_group_activation_code"; // 群聊激活码
export const ADMIN_ACTIVATION_KEY = "admin_activation_code"; // 管理员激活码
export const DEFAULT_ADMIN_ACTIVATION_CODE = "8888"; // 默认群聊激活码
export const DEFAULT_ADMIN_CODE = "6666"; // 默认管理员激活码
