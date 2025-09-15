import {
  users,
  telegramUsers,
  orders,
  botConfig,
  keyboardButtons,
  reportTemplates,
  systemSettings,
  employeeCodes,
  adminGroups,
  type User,
  type UpsertUser,
  type TelegramUser,
  type InsertTelegramUser,
  type Order,
  type InsertOrder,
  type BotConfig,
  type InsertBotConfig,
  type KeyboardButton,
  type InsertKeyboardButton,
  type ReportTemplate,
  type InsertReportTemplate,
  type SystemSetting,
  type InsertSystemSetting,
  type EmployeeCode,
  type InsertEmployeeCode,
  type AdminGroup,
  type InsertAdminGroup,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, like, count, gt, lt, gte } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Telegram user operations
  getTelegramUser(telegramId: string): Promise<TelegramUser | undefined>;
  getTelegramUserById(id: string): Promise<TelegramUser | undefined>;
  createTelegramUser(user: InsertTelegramUser): Promise<TelegramUser>;
  updateTelegramUser(id: string, user: Partial<InsertTelegramUser>): Promise<TelegramUser>;
  getAllTelegramUsers(): Promise<TelegramUser[]>;
  
  // Order operations
  createOrder(order: InsertOrder): Promise<Order>;
  getOrder(id: string): Promise<Order | undefined>;
  getOrderByNumber(orderNumber: string): Promise<Order | undefined>;
  updateOrderStatus(id: string, status: "approved" | "rejected", approvedBy: string, rejectionReason?: string, approvalMethod?: string): Promise<Order>;
  updateOrderGroupMessageId(id: string, groupMessageId: string): Promise<Order>;
  updateModifiedOrder(id: string, modifiedContent: string, approvedBy: string, approvalMethod?: string): Promise<Order>;
  getOrders(params?: {
    status?: string;
    type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: Order[]; total: number }>;
  getOrdersWithUsers(params?: {
    status?: string;
    type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: (Order & { telegramUser: TelegramUser })[]; total: number }>;
  
  // Bot configuration
  getBotConfig(): Promise<BotConfig | undefined>;
  upsertBotConfig(config: InsertBotConfig): Promise<BotConfig>;
  
  // Keyboard buttons
  getActiveKeyboardButtons(): Promise<KeyboardButton[]>;
  getAllKeyboardButtons(): Promise<KeyboardButton[]>;
  createKeyboardButton(button: InsertKeyboardButton): Promise<KeyboardButton>;
  updateKeyboardButton(id: string, button: Partial<InsertKeyboardButton>): Promise<KeyboardButton>;
  deleteKeyboardButton(id: string): Promise<void>;
  
  // Report templates
  getActiveTemplates(): Promise<ReportTemplate[]>;
  getAllTemplates(): Promise<ReportTemplate[]>;
  getTemplateByType(type: string): Promise<ReportTemplate | undefined>;
  createTemplate(template: InsertReportTemplate): Promise<ReportTemplate>;
  updateTemplate(id: string, template: Partial<InsertReportTemplate>): Promise<ReportTemplate>;
  deleteTemplate(id: string): Promise<void>;
  
  // System settings
  getSetting(key: string): Promise<SystemSetting | undefined>;
  setSetting(key: string, value: string): Promise<SystemSetting>;
  getAllSettings(): Promise<SystemSetting[]>;
  
  // Dashboard stats
  getDashboardStats(): Promise<{
    todayOrders: number;
    pendingOrders: number;
    activeEmployees: number;
    totalOrders: number;
  }>;
  
  // Employee codes
  createEmployeeCode(params: { code: string; name: string; type?: string; ttlMinutes?: number }): Promise<EmployeeCode>;
  getEmployeeCode(code: string): Promise<EmployeeCode | undefined>;
  getActiveEmployeeCodes(): Promise<EmployeeCode[]>;
  useEmployeeCode(code: string, telegramId: string): Promise<EmployeeCode | undefined>;
  deleteExpiredCodes(): Promise<void>;
  
  // Admin groups
  createAdminGroup(group: InsertAdminGroup): Promise<AdminGroup>;
  getAdminGroup(groupId: string): Promise<AdminGroup | undefined>;
  getActiveAdminGroups(): Promise<AdminGroup[]>;
  updateAdminGroupStatus(groupId: string, isActive: boolean): Promise<AdminGroup | undefined>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Telegram user operations
  async getTelegramUser(telegramId: string): Promise<TelegramUser | undefined> {
    const [user] = await db
      .select()
      .from(telegramUsers)
      .where(eq(telegramUsers.telegramId, telegramId));
    return user;
  }

  async getTelegramUserById(id: string): Promise<TelegramUser | undefined> {
    const [user] = await db
      .select()
      .from(telegramUsers)
      .where(eq(telegramUsers.id, id));
    return user;
  }

  async createTelegramUser(userData: InsertTelegramUser): Promise<TelegramUser> {
    const [user] = await db
      .insert(telegramUsers)
      .values(userData)
      .returning();
    return user;
  }

  async updateTelegramUser(id: string, userData: Partial<InsertTelegramUser>): Promise<TelegramUser> {
    const [user] = await db
      .update(telegramUsers)
      .set({ ...userData, updatedAt: new Date() })
      .where(eq(telegramUsers.id, id))
      .returning();
    return user;
  }

  async getAllTelegramUsers(): Promise<TelegramUser[]> {
    return await db
      .select()
      .from(telegramUsers)
      .orderBy(desc(telegramUsers.createdAt));
  }

  // Order operations
  async createOrder(orderData: InsertOrder): Promise<Order> {
    // Generate order number
    const orderNumber = `#${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    const [order] = await db
      .insert(orders)
      .values({ ...orderData, orderNumber })
      .returning();
    return order;
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, id));
    return order;
  }

  async getOrderByNumber(orderNumber: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber));
    return order;
  }

  async updateOrderStatus(
    id: string,
    status: "approved" | "rejected",
    approvedBy: string,
    rejectionReason?: string,
    approvalMethod?: string
  ): Promise<Order> {
    const [order] = await db
      .update(orders)
      .set({
        status,
        approvedBy,
        approvedAt: new Date(),
        rejectionReason,
        approvalMethod: approvalMethod || "web_dashboard",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async updateOrderGroupMessageId(id: string, groupMessageId: string): Promise<Order> {
    const [order] = await db
      .update(orders)
      .set({
        groupMessageId,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async updateModifiedOrder(id: string, modifiedContent: string, approvedBy: string, approvalMethod?: string): Promise<Order> {
    const [order] = await db
      .update(orders)
      .set({
        status: "approved_modified",
        modifiedContent,
        isModified: true,
        approvedBy,
        approvedAt: new Date(),
        modificationTime: new Date(),
        approvalMethod: approvalMethod || "bot_panel",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async getOrders(params?: {
    status?: string;
    type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: Order[]; total: number }> {
    const conditions = [];
    
    if (params?.status) {
      conditions.push(eq(orders.status, params.status as any));
    }
    
    if (params?.type) {
      conditions.push(eq(orders.type, params.type as any));
    }
    
    if (params?.search) {
      conditions.push(
        or(
          like(orders.orderNumber, `%${params.search}%`),
          like(orders.description, `%${params.search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [ordersList, totalCount] = await Promise.all([
      db
        .select()
        .from(orders)
        .where(whereClause)
        .orderBy(desc(orders.createdAt))
        .limit(params?.limit || 50)
        .offset(params?.offset || 0),
      db
        .select({ count: count() })
        .from(orders)
        .where(whereClause)
        .then(result => result[0].count)
    ]);

    return { orders: ordersList, total: totalCount };
  }

  async getOrdersWithUsers(params?: {
    status?: string;
    type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: (Order & { telegramUser: TelegramUser })[]; total: number }> {
    const conditions = [];
    
    if (params?.status) {
      conditions.push(eq(orders.status, params.status as any));
    }
    
    if (params?.type) {
      conditions.push(eq(orders.type, params.type as any));
    }
    
    if (params?.search) {
      conditions.push(
        or(
          like(orders.orderNumber, `%${params.search}%`),
          like(orders.description, `%${params.search}%`),
          like(telegramUsers.username, `%${params.search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [ordersList, totalCount] = await Promise.all([
      db
        .select()
        .from(orders)
        .innerJoin(telegramUsers, eq(orders.telegramUserId, telegramUsers.id))
        .where(whereClause)
        .orderBy(desc(orders.createdAt))
        .limit(params?.limit || 50)
        .offset(params?.offset || 0),
      db
        .select({ count: count() })
        .from(orders)
        .innerJoin(telegramUsers, eq(orders.telegramUserId, telegramUsers.id))
        .where(whereClause)
        .then(result => result[0].count)
    ]);

    // Debug: Log the raw data structure
    if (ordersList.length > 0) {
      console.log('[DEBUG] Raw ordersList structure:', JSON.stringify(ordersList[0], null, 2));
    }

    // Flatten the joined data structure to match frontend expectations
    const formattedOrders = ordersList.map((row: any) => {
      // Debug each row
      console.log('[DEBUG] Processing row keys:', Object.keys(row));
      
      // Drizzle ORM returns nested structure with table names as keys
      const order = row.orders || row;
      const telegramUser = row.telegram_users || row.telegramUsers;
      
      console.log('[DEBUG] Order data:', order?.id, order?.orderNumber);
      console.log('[DEBUG] TelegramUser data:', telegramUser?.firstName, telegramUser?.username);
      
      const result = {
        ...order,
        telegramUser: telegramUser
      };
      
      console.log('[DEBUG] Final formatted order:', result.id, result.telegramUser?.firstName);
      return result;
    });

    return { orders: formattedOrders, total: totalCount };
  }

  // Bot configuration
  async getBotConfig(): Promise<BotConfig | undefined> {
    const [config] = await db
      .select()
      .from(botConfig)
      .where(eq(botConfig.isActive, true))
      .limit(1);
    return config;
  }

  async upsertBotConfig(configData: InsertBotConfig): Promise<BotConfig> {
    // Deactivate existing configs
    await db
      .update(botConfig)
      .set({ isActive: false });

    const [config] = await db
      .insert(botConfig)
      .values(configData)
      .returning();
    return config;
  }

  // Keyboard buttons
  async getActiveKeyboardButtons(): Promise<KeyboardButton[]> {
    return await db
      .select()
      .from(keyboardButtons)
      .where(eq(keyboardButtons.isActive, true))
      .orderBy(keyboardButtons.sortOrder);
  }

  async getAllKeyboardButtons(): Promise<KeyboardButton[]> {
    return await db
      .select()
      .from(keyboardButtons)
      .orderBy(keyboardButtons.sortOrder);
  }

  async createKeyboardButton(buttonData: InsertKeyboardButton): Promise<KeyboardButton> {
    const [button] = await db
      .insert(keyboardButtons)
      .values(buttonData)
      .returning();
    return button;
  }

  async updateKeyboardButton(id: string, buttonData: Partial<InsertKeyboardButton>): Promise<KeyboardButton> {
    const [button] = await db
      .update(keyboardButtons)
      .set(buttonData)
      .where(eq(keyboardButtons.id, id))
      .returning();
    return button;
  }

  async deleteKeyboardButton(id: string): Promise<void> {
    await db
      .delete(keyboardButtons)
      .where(eq(keyboardButtons.id, id));
  }

  // Report templates
  async getActiveTemplates(): Promise<ReportTemplate[]> {
    return await db
      .select()
      .from(reportTemplates)
      .where(eq(reportTemplates.isActive, true))
      .orderBy(desc(reportTemplates.createdAt));
  }

  async getAllTemplates(): Promise<ReportTemplate[]> {
    return await db
      .select()
      .from(reportTemplates)
      .orderBy(desc(reportTemplates.createdAt));
  }

  async getTemplateByType(type: string): Promise<ReportTemplate | undefined> {
    const [template] = await db
      .select()
      .from(reportTemplates)
      .where(and(
        eq(reportTemplates.type, type as any),
        eq(reportTemplates.isActive, true)
      ))
      .limit(1);
    return template;
  }

  async createTemplate(templateData: InsertReportTemplate): Promise<ReportTemplate> {
    const [template] = await db
      .insert(reportTemplates)
      .values(templateData)
      .returning();
    return template;
  }

  async updateTemplate(id: string, templateData: Partial<InsertReportTemplate>): Promise<ReportTemplate> {
    const [template] = await db
      .update(reportTemplates)
      .set({ ...templateData, updatedAt: new Date() })
      .where(eq(reportTemplates.id, id))
      .returning();
    return template;
  }

  async deleteTemplate(id: string): Promise<void> {
    await db
      .delete(reportTemplates)
      .where(eq(reportTemplates.id, id));
  }

  // System settings
  async getSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key));
    return setting;
  }

  async setSetting(key: string, value: string): Promise<SystemSetting> {
    const [setting] = await db
      .insert(systemSettings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updatedAt: new Date() },
      })
      .returning();
    return setting;
  }

  async getAllSettings(): Promise<SystemSetting[]> {
    return await db
      .select()
      .from(systemSettings);
  }

  // Dashboard stats
  async getDashboardStats(): Promise<{
    todayOrders: number;
    pendingOrders: number;
    activeEmployees: number;
    totalOrders: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayOrdersResult, pendingOrdersResult, activeEmployeesResult, totalOrdersResult] = await Promise.all([
      db
        .select({ count: count() })
        .from(orders)
        .where(eq(orders.createdAt, today))
        .then(result => result[0].count),
      db
        .select({ count: count() })
        .from(orders)
        .where(eq(orders.status, "pending"))
        .then(result => result[0].count),
      db
        .select({ count: count() })
        .from(telegramUsers)
        .where(and(
          eq(telegramUsers.isActive, true),
          eq(telegramUsers.role, "employee")
        ))
        .then(result => result[0].count),
      db
        .select({ count: count() })
        .from(orders)
        .then(result => result[0].count)
    ]);

    return {
      todayOrders: todayOrdersResult,
      pendingOrders: pendingOrdersResult,
      activeEmployees: activeEmployeesResult,
      totalOrders: totalOrdersResult,
    };
  }
  
  // Employee codes implementation
  async createEmployeeCode(params: { code: string; name: string; type?: string; ttlMinutes?: number }): Promise<EmployeeCode> {
    // Calculate expiration time based on ttlMinutes (default 15 minutes)
    const ttlMinutes = params.ttlMinutes ?? 15;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    
    // Prepare data for insertion
    const dataToInsert = {
      code: params.code,
      name: params.name,
      type: params.type ?? 'employee',
      isUsed: false,
      expiresAt,
    };
    
    const [code] = await db.insert(employeeCodes).values(dataToInsert).returning();
    
    // Log creation details (without exposing the actual code for security)
    console.log(`Created employee code: ID=${code.id}, Name=${code.name}, Type=${code.type}, ExpiresAt=${code.expiresAt.toISOString()}, TTL=${ttlMinutes}min`);
    
    return code;
  }
  
  async getEmployeeCode(code: string): Promise<EmployeeCode | undefined> {
    const [empCode] = await db
      .select()
      .from(employeeCodes)
      .where(eq(employeeCodes.code, code));
    return empCode;
  }
  
  async getActiveEmployeeCodes(): Promise<EmployeeCode[]> {
    const now = new Date();
    return await db
      .select()
      .from(employeeCodes)
      .where(
        and(
          eq(employeeCodes.isUsed, false),
          gt(employeeCodes.expiresAt, now)
        )
      )
      .orderBy(desc(employeeCodes.createdAt));
  }
  
  async useEmployeeCode(code: string, telegramId: string): Promise<EmployeeCode | undefined> {
    const now = new Date();
    const [empCode] = await db
      .select()
      .from(employeeCodes)
      .where(
        and(
          eq(employeeCodes.code, code),
          eq(employeeCodes.isUsed, false),
          gt(employeeCodes.expiresAt, now)
        )
      );
    
    if (!empCode) return undefined;
    
    const [updated] = await db
      .update(employeeCodes)
      .set({
        isUsed: true,
        usedBy: telegramId,
        usedAt: now,
      })
      .where(eq(employeeCodes.id, empCode.id))
      .returning();
    
    return updated;
  }
  
  async deleteExpiredCodes(): Promise<void> {
    const now = new Date();
    await db
      .delete(employeeCodes)
      .where(
        and(
          eq(employeeCodes.isUsed, false),
          lt(employeeCodes.expiresAt, now) // Only delete actually expired codes
        )
      );
  }
  
  // Admin groups implementation
  async createAdminGroup(groupData: InsertAdminGroup): Promise<AdminGroup> {
    const [group] = await db.insert(adminGroups).values(groupData).returning();
    return group;
  }
  
  async getAdminGroup(groupId: string): Promise<AdminGroup | undefined> {
    const [group] = await db
      .select()
      .from(adminGroups)
      .where(eq(adminGroups.groupId, groupId));
    return group;
  }
  
  async getActiveAdminGroups(): Promise<AdminGroup[]> {
    return await db
      .select()
      .from(adminGroups)
      .where(eq(adminGroups.isActive, true))
      .orderBy(desc(adminGroups.activatedAt));
  }
  
  async updateAdminGroupStatus(groupId: string, isActive: boolean): Promise<AdminGroup | undefined> {
    const [group] = await db
      .update(adminGroups)
      .set({ isActive })
      .where(eq(adminGroups.groupId, groupId))
      .returning();
    return group;
  }
}

export const storage = new DatabaseStorage();
