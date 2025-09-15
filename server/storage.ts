import {
  users,
  telegramUsers,
  orders,
  botConfig,
  keyboardButtons,
  reportTemplates,
  systemSettings,
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
  type AdminGroup,
  type InsertAdminGroup,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, like, count, gt, lt, gte, lte, ne, isNotNull, isNull, sql } from "drizzle-orm";
import { getBeijingStartOfDay, getBeijingEndOfDay } from "@shared/utils/timeUtils";

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
    totalEmployees: number;
    totalOrders: number;
  }>;
  
  
  // Admin groups
  createAdminGroup(group: InsertAdminGroup): Promise<AdminGroup>;
  getAdminGroup(groupId: string): Promise<AdminGroup | undefined>;
  getActiveAdminGroups(): Promise<AdminGroup[]>;
  updateAdminGroupStatus(groupId: string, isActive: boolean): Promise<AdminGroup | undefined>;
  
  // Customer analysis
  searchCustomers(name?: string, params?: { limit?: number; offset?: number }): Promise<{ customers: string[]; total: number }>;
  getCustomerOrders(customerName: string, params?: {
    type?: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: (Order & { telegramUser: TelegramUser })[]; total: number }>;
  getCustomerStats(customerName: string, params?: {
    type?: string;
    status?: string;
    from?: string;
    to?: string;
  }): Promise<{
    totalOrders: number;
    totalAmount: string;
    depositCount: number;
    withdrawalCount: number;
    refundCount: number;
    avgAmount: string;
    depositAmount: string;
    withdrawalAmount: string;
    refundAmount: string;
    depositPercentage: number;
    withdrawalPercentage: number;
    refundPercentage: number;
  }>;
  
  // Project analysis  
  searchProjects(name?: string, params?: { limit?: number; offset?: number }): Promise<{ projects: string[]; total: number }>;
  getProjectOrders(projectName: string, params?: {
    type?: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: (Order & { telegramUser: TelegramUser })[]; total: number }>;
  getProjectStats(projectName: string, params?: {
    type?: string;
    status?: string;
    from?: string;
    to?: string;
  }): Promise<{
    totalOrders: number;
    totalAmount: string;
    depositCount: number;
    withdrawalCount: number;
    refundCount: number;
    avgAmount: string;
  }>;
  
  // Batch processing methods for order data extraction
  getOrdersForReprocessing(params?: {
    limit?: number;
    offset?: number;
  }): Promise<{ orders: Order[]; total: number }>;
  
  batchUpdateOrderExtractionData(updates: Array<{
    id: string;
    customerName: string | null;
    projectName: string | null;
    amountExtracted: string | null;
    extractionStatus: "success" | "failed";
  }>): Promise<number>;
  
  getReprocessingStats(): Promise<{
    totalOrders: number;
    pendingOrders: number;
    successfulExtractions: number;
    failedExtractions: number;
  }>;
  
  // Type analysis
  getOrderTypes(params?: {
    from?: string;
    to?: string;
    status?: string;
    employee?: string;
  }): Promise<{
    types: Array<{
      key: string;
      name: string;
      count: number;
      amount: string;
    }>;
  }>;
  
  getOrdersByType(orderType: string, params?: {
    status?: string;
    from?: string;
    to?: string;
    employee?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: (Order & { telegramUser: TelegramUser })[]; total: number }>;
  
  getTypeStats(orderType: string, params?: {
    status?: string;
    from?: string;
    to?: string;
    employee?: string;
  }): Promise<{
    totalOrders: number;
    totalAmount: string;
    avgAmount: string;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    trends: Array<{
      date: string;
      count: number;
      amount: string;
    }>;
  }>;
  
  getTypeCustomers(orderType: string, params?: {
    status?: string;
    from?: string;
    to?: string;
    employee?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    customers: Array<{
      name: string;
      count: number;
      amount: string;
      lastOrderDate: string;
    }>;
    total: number;
  }>;
  
  getTypeProjects(orderType: string, params?: {
    status?: string;
    from?: string;
    to?: string;
    employee?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    projects: Array<{
      name: string;
      count: number;
      amount: string;
      lastOrderDate: string;
    }>;
    total: number;
  }>;
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

    // Flatten the joined data structure to match frontend expectations
    const formattedOrders = ordersList.map((row: any) => {
      // Drizzle ORM returns nested structure with table names as keys
      const order = row.orders || row;
      const telegramUser = row.telegram_users || row.telegramUsers;
      
      return {
        ...order,
        telegramUser: telegramUser
      };
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
    totalEmployees: number;
    totalOrders: number;
  }> {
    // Get today's date range in Beijing timezone
    const todayStart = getBeijingStartOfDay(new Date());
    const todayEnd = getBeijingEndOfDay(new Date());

    const [todayOrdersResult, pendingOrdersResult, totalEmployeesResult, totalOrdersResult] = await Promise.all([
      db
        .select({ count: count() })
        .from(orders)
        .where(and(
          gte(orders.createdAt, todayStart),
          lte(orders.createdAt, todayEnd)
        ))
        .then(result => result[0].count),
      db
        .select({ count: count() })
        .from(orders)
        .where(eq(orders.status, "pending"))
        .then(result => result[0].count),
      db
        .select({ count: count() })
        .from(telegramUsers)
        .where(eq(telegramUsers.role, "employee"))
        .then(result => result[0].count),
      db
        .select({ count: count() })
        .from(orders)
        .then(result => result[0].count)
    ]);

    return {
      todayOrders: todayOrdersResult,
      pendingOrders: pendingOrdersResult,
      totalEmployees: totalEmployeesResult,
      totalOrders: totalOrdersResult,
    };
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
  
  // Customer analysis implementation
  async searchCustomers(name?: string, params?: { limit?: number; offset?: number }): Promise<{ customers: string[]; total: number }> {
    const conditions = [];
    
    // Only search where customerName is not null and not empty
    conditions.push(and(
      isNotNull(orders.customerName),
      ne(orders.customerName, "")
    ));
    
    if (name && name.trim()) {
      conditions.push(like(orders.customerName, `%${name.trim()}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [customersList, totalCount] = await Promise.all([
      db
        .selectDistinct({ customerName: orders.customerName })
        .from(orders)
        .where(whereClause)
        .orderBy(orders.customerName)
        .limit(params?.limit || 50)
        .offset(params?.offset || 0),
      db
        .selectDistinct({ customerName: orders.customerName })
        .from(orders)
        .where(whereClause)
        .then(result => result.length)
    ]);

    const customers = customersList
      .map(row => row.customerName)
      .filter(name => name !== null && name !== "") as string[];

    return { customers, total: totalCount };
  }
  
  async getCustomerOrders(customerName: string, params?: {
    type?: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: (Order & { telegramUser: TelegramUser })[]; total: number }> {
    const conditions = [eq(orders.customerName, customerName)];
    
    if (params?.type) {
      conditions.push(eq(orders.type, params.type as any));
    }
    
    if (params?.status) {
      conditions.push(eq(orders.status, params.status as any));
    }
    
    if (params?.from) {
      const fromDate = getBeijingStartOfDay(params.from);
      conditions.push(gte(orders.createdAt, fromDate));
    }
    
    if (params?.to) {
      const toDate = getBeijingEndOfDay(params.to);
      conditions.push(lte(orders.createdAt, toDate));
    }

    const whereClause = and(...conditions);

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

    // Flatten the joined data structure
    const formattedOrders = ordersList.map((row: any) => {
      const order = row.orders || row;
      const telegramUser = row.telegram_users || row.telegramUsers;
      
      return {
        ...order,
        telegramUser: telegramUser
      };
    });

    return { orders: formattedOrders, total: totalCount };
  }
  
  async getCustomerStats(customerName: string, params?: {
    type?: string;
    status?: string;
    from?: string;
    to?: string;
  }): Promise<{
    totalOrders: number;
    totalAmount: string;
    depositCount: number;
    withdrawalCount: number;
    refundCount: number;
    avgAmount: string;
    depositAmount: string;
    withdrawalAmount: string;
    refundAmount: string;
    depositPercentage: number;
    withdrawalPercentage: number;
    refundPercentage: number;
  }> {
    const conditions = [eq(orders.customerName, customerName)];
    
    if (params?.type) {
      conditions.push(eq(orders.type, params.type as any));
    }
    
    if (params?.status) {
      conditions.push(eq(orders.status, params.status as any));
    }
    
    if (params?.from) {
      const fromDate = getBeijingStartOfDay(params.from);
      conditions.push(gte(orders.createdAt, fromDate));
    }
    
    if (params?.to) {
      const toDate = getBeijingEndOfDay(params.to);
      conditions.push(lte(orders.createdAt, toDate));
    }

    const whereClause = and(...conditions);

    const [totalResult, typeResults] = await Promise.all([
      db
        .select({ count: count() })
        .from(orders)
        .where(whereClause)
        .then(result => result[0].count),
      db
        .select({ 
          type: orders.type,
          count: count(),
        })
        .from(orders)
        .where(whereClause)
        .groupBy(orders.type)
    ]);

    // Get all orders with type and amount for detailed calculation
    const allOrders = await db
      .select({ 
        type: orders.type,
        amount: orders.amount 
      })
      .from(orders)
      .where(whereClause);

    // Calculate totals and type-specific amounts
    let totalAmount = 0;
    let depositAmount = 0;
    let withdrawalAmount = 0;
    let refundAmount = 0;

    allOrders.forEach(order => {
      const amount = parseFloat(order.amount || '0');
      if (!isNaN(amount)) {
        totalAmount += amount;
        switch (order.type) {
          case 'deposit':
            depositAmount += amount;
            break;
          case 'withdrawal':
            withdrawalAmount += amount;
            break;
          case 'refund':
            refundAmount += amount;
            break;
        }
      }
    });

    const depositCount = typeResults.find(r => r.type === 'deposit')?.count || 0;
    const withdrawalCount = typeResults.find(r => r.type === 'withdrawal')?.count || 0;
    const refundCount = typeResults.find(r => r.type === 'refund')?.count || 0;
    
    const avgAmount = totalResult > 0 ? (totalAmount / totalResult).toFixed(2) : '0.00';

    // Calculate percentages
    const depositPercentage = totalAmount > 0 ? Number(((depositAmount / totalAmount) * 100).toFixed(1)) : 0;
    const withdrawalPercentage = totalAmount > 0 ? Number(((withdrawalAmount / totalAmount) * 100).toFixed(1)) : 0;
    const refundPercentage = totalAmount > 0 ? Number(((refundAmount / totalAmount) * 100).toFixed(1)) : 0;

    return {
      totalOrders: totalResult,
      totalAmount: totalAmount.toFixed(2),
      depositCount,
      withdrawalCount,
      refundCount,
      avgAmount,
      depositAmount: depositAmount.toFixed(2),
      withdrawalAmount: withdrawalAmount.toFixed(2),
      refundAmount: refundAmount.toFixed(2),
      depositPercentage,
      withdrawalPercentage,
      refundPercentage
    };
  }
  
  // Project analysis implementation
  async searchProjects(name?: string, params?: { limit?: number; offset?: number }): Promise<{ projects: string[]; total: number }> {
    const conditions = [];
    
    // Only search where projectName is not null and not empty
    conditions.push(and(
      isNotNull(orders.projectName),
      ne(orders.projectName, "")
    ));
    
    if (name && name.trim()) {
      conditions.push(like(orders.projectName, `%${name.trim()}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [projectsList, totalCount] = await Promise.all([
      db
        .selectDistinct({ projectName: orders.projectName })
        .from(orders)
        .where(whereClause)
        .orderBy(orders.projectName)
        .limit(params?.limit || 50)
        .offset(params?.offset || 0),
      db
        .selectDistinct({ projectName: orders.projectName })
        .from(orders)
        .where(whereClause)
        .then(result => result.length)
    ]);

    const projects = projectsList
      .map(row => row.projectName)
      .filter(name => name !== null && name !== "") as string[];

    return { projects, total: totalCount };
  }
  
  async getProjectOrders(projectName: string, params?: {
    type?: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: (Order & { telegramUser: TelegramUser })[]; total: number }> {
    const conditions = [eq(orders.projectName, projectName)];
    
    if (params?.type) {
      conditions.push(eq(orders.type, params.type as any));
    }
    
    if (params?.status) {
      conditions.push(eq(orders.status, params.status as any));
    }
    
    if (params?.from) {
      const fromDate = getBeijingStartOfDay(params.from);
      conditions.push(gte(orders.createdAt, fromDate));
    }
    
    if (params?.to) {
      const toDate = getBeijingEndOfDay(params.to);
      conditions.push(lte(orders.createdAt, toDate));
    }

    const whereClause = and(...conditions);

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

    // Flatten the joined data structure
    const formattedOrders = ordersList.map((row: any) => {
      const order = row.orders || row;
      const telegramUser = row.telegram_users || row.telegramUsers;
      
      return {
        ...order,
        telegramUser: telegramUser
      };
    });

    return { orders: formattedOrders, total: totalCount };
  }
  
  async getProjectStats(projectName: string, params?: {
    type?: string;
    status?: string;
    from?: string;
    to?: string;
  }): Promise<{
    totalOrders: number;
    totalAmount: string;
    depositCount: number;
    withdrawalCount: number;
    refundCount: number;
    avgAmount: string;
  }> {
    const conditions = [eq(orders.projectName, projectName)];
    
    if (params?.type) {
      conditions.push(eq(orders.type, params.type as any));
    }
    
    if (params?.status) {
      conditions.push(eq(orders.status, params.status as any));
    }
    
    if (params?.from) {
      const fromDate = getBeijingStartOfDay(params.from);
      conditions.push(gte(orders.createdAt, fromDate));
    }
    
    if (params?.to) {
      const toDate = getBeijingEndOfDay(params.to);
      conditions.push(lte(orders.createdAt, toDate));
    }

    const whereClause = and(...conditions);

    const [totalResult, typeResults] = await Promise.all([
      db
        .select({ count: count() })
        .from(orders)
        .where(whereClause)
        .then(result => result[0].count),
      db
        .select({ 
          type: orders.type,
          count: count(),
        })
        .from(orders)
        .where(whereClause)
        .groupBy(orders.type)
    ]);

    // Get all orders for amount calculation
    const allOrders = await db
      .select({ amount: orders.amount })
      .from(orders)
      .where(whereClause);

    // Calculate totals
    let totalAmount = 0;
    allOrders.forEach(order => {
      const amount = parseFloat(order.amount || '0');
      if (!isNaN(amount)) {
        totalAmount += amount;
      }
    });

    const depositCount = typeResults.find(r => r.type === 'deposit')?.count || 0;
    const withdrawalCount = typeResults.find(r => r.type === 'withdrawal')?.count || 0;
    const refundCount = typeResults.find(r => r.type === 'refund')?.count || 0;
    
    const avgAmount = totalResult > 0 ? (totalAmount / totalResult).toFixed(2) : '0.00';

    return {
      totalOrders: totalResult,
      totalAmount: totalAmount.toFixed(2),
      depositCount,
      withdrawalCount,
      refundCount,
      avgAmount
    };
  }

  // Batch processing methods for order data extraction
  async getOrdersForReprocessing(params?: {
    limit?: number;
    offset?: number;
  }): Promise<{ orders: Order[]; total: number }> {
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;
    
    // Get orders where extraction status is null or 'pending' and has originalContent
    const conditions = [
      and(
        or(
          isNull(orders.extractionStatus),
          eq(orders.extractionStatus, 'pending')
        ),
        isNotNull(orders.originalContent)
      )
    ];

    const whereClause = and(...conditions);

    const [ordersList, totalCount] = await Promise.all([
      db
        .select()
        .from(orders)
        .where(whereClause)
        .orderBy(desc(orders.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(orders)
        .where(whereClause)
        .then(result => result[0].count)
    ]);

    return {
      orders: ordersList,
      total: totalCount
    };
  }

  async batchUpdateOrderExtractionData(updates: Array<{
    id: string;
    customerName: string | null;
    projectName: string | null;
    amountExtracted: string | null;
    extractionStatus: "success" | "failed";
  }>): Promise<number> {
    if (updates.length === 0) {
      return 0;
    }

    let updatedCount = 0;
    
    // Process updates individually to ensure each one is handled properly
    for (const update of updates) {
      try {
        const [result] = await db
          .update(orders)
          .set({
            customerName: update.customerName,
            projectName: update.projectName,
            amountExtracted: update.amountExtracted,
            extractionStatus: update.extractionStatus,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, update.id))
          .returning({ id: orders.id });
        
        if (result) {
          updatedCount++;
        }
      } catch (error) {
        console.error(`Failed to update order ${update.id}:`, error);
        // Continue with other updates even if one fails
      }
    }

    return updatedCount;
  }

  async getReprocessingStats(): Promise<{
    totalOrders: number;
    pendingOrders: number;
    successfulExtractions: number;
    failedExtractions: number;
  }> {
    const [
      totalResult,
      pendingResult,
      successResult,
      failedResult
    ] = await Promise.all([
      // Total orders with originalContent
      db
        .select({ count: count() })
        .from(orders)
        .where(isNotNull(orders.originalContent))
        .then(result => result[0].count),
      
      // Pending extractions
      db
        .select({ count: count() })
        .from(orders)
        .where(
          and(
            isNotNull(orders.originalContent),
            or(
              isNull(orders.extractionStatus),
              eq(orders.extractionStatus, 'pending')
            )
          )
        )
        .then(result => result[0].count),
      
      // Successful extractions
      db
        .select({ count: count() })
        .from(orders)
        .where(
          and(
            isNotNull(orders.originalContent),
            eq(orders.extractionStatus, 'success')
          )
        )
        .then(result => result[0].count),
      
      // Failed extractions
      db
        .select({ count: count() })
        .from(orders)
        .where(
          and(
            isNotNull(orders.originalContent),
            eq(orders.extractionStatus, 'failed')
          )
        )
        .then(result => result[0].count)
    ]);

    return {
      totalOrders: totalResult,
      pendingOrders: pendingResult,
      successfulExtractions: successResult,
      failedExtractions: failedResult
    };
  }

  // Type analysis implementations
  async getOrderTypes(params?: {
    from?: string;
    to?: string;
    status?: string;
    employee?: string;
  }): Promise<{
    types: Array<{
      key: string;
      name: string;
      count: number;
      amount: string;
    }>;
  }> {
    const conditions = [];
    
    if (params?.from) {
      const fromDate = getBeijingStartOfDay(params.from);
      conditions.push(gte(orders.createdAt, fromDate));
    }
    
    if (params?.to) {
      const toDate = getBeijingEndOfDay(params.to);
      conditions.push(lte(orders.createdAt, toDate));
    }
    
    if (params?.status) {
      conditions.push(eq(orders.status, params.status as any));
    }
    
    if (params?.employee) {
      conditions.push(eq(orders.telegramUserId, params.employee));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get type counts and amounts
    const typeStatsRaw = await db
      .select({
        type: orders.type,
        count: count(),
        totalAmount: sql<string>`COALESCE(SUM(CAST(${orders.amount} AS DECIMAL)), 0)::text`,
      })
      .from(orders)
      .where(whereClause)
      .groupBy(orders.type);

    // Map type names
    const typeNameMap = {
      deposit: '入款',
      withdrawal: '出款', 
      refund: '退款'
    };

    const types = typeStatsRaw.map(stat => ({
      key: stat.type,
      name: typeNameMap[stat.type as keyof typeof typeNameMap] || stat.type,
      count: Number(stat.count),
      amount: stat.totalAmount || '0'
    }));

    return { types };
  }

  async getOrdersByType(orderType: string, params?: {
    status?: string;
    from?: string;
    to?: string;
    employee?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: (Order & { telegramUser: TelegramUser })[]; total: number }> {
    const conditions = [eq(orders.type, orderType as any)];
    
    if (params?.status) {
      conditions.push(eq(orders.status, params.status as any));
    }
    
    if (params?.from) {
      const fromDate = getBeijingStartOfDay(params.from);
      conditions.push(gte(orders.createdAt, fromDate));
    }
    
    if (params?.to) {
      const toDate = getBeijingEndOfDay(params.to);
      conditions.push(lte(orders.createdAt, toDate));
    }
    
    if (params?.employee) {
      conditions.push(eq(orders.telegramUserId, params.employee));
    }

    const whereClause = and(...conditions);

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

    const formattedOrders = ordersList.map((row: any) => {
      const order = row.orders || row;
      const telegramUser = row.telegram_users || row.telegramUsers;
      
      return {
        ...order,
        telegramUser: telegramUser
      };
    });

    return { orders: formattedOrders, total: totalCount };
  }

  async getTypeStats(orderType: string, params?: {
    status?: string;
    from?: string;
    to?: string;
    employee?: string;
  }): Promise<{
    totalOrders: number;
    totalAmount: string;
    avgAmount: string;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    trends: Array<{
      date: string;
      count: number;
      amount: string;
    }>;
  }> {
    const baseConditions = [eq(orders.type, orderType as any)];
    
    if (params?.from) {
      const fromDate = getBeijingStartOfDay(params.from);
      baseConditions.push(gte(orders.createdAt, fromDate));
    }
    
    if (params?.to) {
      const toDate = getBeijingEndOfDay(params.to);
      baseConditions.push(lte(orders.createdAt, toDate));
    }
    
    if (params?.employee) {
      baseConditions.push(eq(orders.telegramUserId, params.employee));
    }

    const baseWhere = and(...baseConditions);

    // Get overall stats
    const [overallStats] = await db
      .select({
        totalOrders: count(),
        totalAmount: sql<string>`COALESCE(SUM(CAST(${orders.amount} AS DECIMAL)), 0)::text`,
        avgAmount: sql<string>`COALESCE(AVG(CAST(${orders.amount} AS DECIMAL)), 0)::text`,
      })
      .from(orders)
      .where(baseWhere);

    // Get status counts
    const statusCounts = await db
      .select({
        status: orders.status,
        count: count(),
      })
      .from(orders)
      .where(baseWhere)
      .groupBy(orders.status);

    // Convert status counts to object
    const statusCountMap = statusCounts.reduce((acc, item) => {
      acc[item.status] = Number(item.count);
      return acc;
    }, {} as Record<string, number>);

    // Get daily trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const trendsConditions = [...baseConditions, gte(orders.createdAt, thirtyDaysAgo)];
    const trendsWhere = and(...trendsConditions);

    const trends = await db
      .select({
        date: sql<string>`DATE(${orders.createdAt})`,
        count: count(),
        amount: sql<string>`COALESCE(SUM(CAST(${orders.amount} AS DECIMAL)), 0)::text`,
      })
      .from(orders)
      .where(trendsWhere)
      .groupBy(sql`DATE(${orders.createdAt})`)
      .orderBy(sql`DATE(${orders.createdAt})`);

    return {
      totalOrders: Number(overallStats.totalOrders),
      totalAmount: overallStats.totalAmount || '0',
      avgAmount: parseFloat(overallStats.avgAmount || '0').toFixed(2),
      pendingCount: statusCountMap.pending || 0,
      approvedCount: (statusCountMap.approved || 0) + (statusCountMap.approved_modified || 0),
      rejectedCount: statusCountMap.rejected || 0,
      trends: trends.map(trend => ({
        date: trend.date,
        count: Number(trend.count),
        amount: trend.amount || '0'
      }))
    };
  }

  async getTypeCustomers(orderType: string, params?: {
    status?: string;
    from?: string;
    to?: string;
    employee?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    customers: Array<{
      name: string;
      count: number;
      amount: string;
      lastOrderDate: string;
    }>;
    total: number;
  }> {
    const conditions = [
      eq(orders.type, orderType as any),
      isNotNull(orders.customerName)
    ];
    
    if (params?.status) {
      conditions.push(eq(orders.status, params.status as any));
    }
    
    if (params?.from) {
      const fromDate = getBeijingStartOfDay(params.from);
      conditions.push(gte(orders.createdAt, fromDate));
    }
    
    if (params?.to) {
      const toDate = getBeijingEndOfDay(params.to);
      conditions.push(lte(orders.createdAt, toDate));
    }
    
    if (params?.employee) {
      conditions.push(eq(orders.telegramUserId, params.employee));
    }

    const whereClause = and(...conditions);

    const [customerStats, totalCount] = await Promise.all([
      db
        .select({
          name: orders.customerName,
          count: count(),
          amount: sql<string>`COALESCE(SUM(CAST(${orders.amount} AS DECIMAL)), 0)::text`,
          lastOrderDate: sql<string>`MAX(${orders.createdAt})`,
        })
        .from(orders)
        .where(whereClause)
        .groupBy(orders.customerName)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(params?.limit || 50)
        .offset(params?.offset || 0),
      db
        .select({ count: sql<number>`COUNT(DISTINCT ${orders.customerName})` })
        .from(orders)
        .where(whereClause)
        .then(result => result[0].count)
    ]);

    const customers = customerStats.map((stat: any) => ({
      name: stat.name || 'Unknown',
      count: Number(stat.count),
      amount: stat.amount || '0',
      lastOrderDate: new Date(stat.lastOrderDate).toISOString().split('T')[0]
    }));

    return { customers, total: totalCount };
  }

  async getTypeProjects(orderType: string, params?: {
    status?: string;
    from?: string;
    to?: string;
    employee?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    projects: Array<{
      name: string;
      count: number;
      amount: string;
      lastOrderDate: string;
    }>;
    total: number;
  }> {
    const conditions = [
      eq(orders.type, orderType as any),
      isNotNull(orders.projectName)
    ];
    
    if (params?.status) {
      conditions.push(eq(orders.status, params.status as any));
    }
    
    if (params?.from) {
      const fromDate = getBeijingStartOfDay(params.from);
      conditions.push(gte(orders.createdAt, fromDate));
    }
    
    if (params?.to) {
      const toDate = getBeijingEndOfDay(params.to);
      conditions.push(lte(orders.createdAt, toDate));
    }
    
    if (params?.employee) {
      conditions.push(eq(orders.telegramUserId, params.employee));
    }

    const whereClause = and(...conditions);

    const [projectStats, totalCount] = await Promise.all([
      db
        .select({
          name: orders.projectName,
          count: count(),
          amount: sql<string>`COALESCE(SUM(CAST(${orders.amount} AS DECIMAL)), 0)::text`,
          lastOrderDate: sql<string>`MAX(${orders.createdAt})`,
        })
        .from(orders)
        .where(whereClause)
        .groupBy(orders.projectName)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(params?.limit || 50)
        .offset(params?.offset || 0),
      db
        .select({ count: sql<number>`COUNT(DISTINCT ${orders.projectName})` })
        .from(orders)
        .where(whereClause)
        .then(result => result[0].count)
    ]);

    const projects = projectStats.map((stat: any) => ({
      name: stat.name || 'Unknown',
      count: Number(stat.count),
      amount: stat.amount || '0',
      lastOrderDate: new Date(stat.lastOrderDate).toISOString().split('T')[0]
    }));

    return { projects, total: totalCount };
  }

  // Excel export data methods
  async getExportData(): Promise<{
    employees: any[];
    customers: any[];
    projects: any[];
    summary: any;
  }> {
    // Get employee statistics
    const employees = await db
      .select({
        id: telegramUsers.id,
        username: telegramUsers.username,
        firstName: telegramUsers.firstName,
        role: telegramUsers.role,
        isActive: telegramUsers.isActive,
        createdAt: telegramUsers.createdAt,
        totalOrders: sql<number>`COUNT(${orders.id})`,
        depositOrders: sql<number>`SUM(CASE WHEN ${orders.type} = 'deposit' THEN 1 ELSE 0 END)`,
        withdrawalOrders: sql<number>`SUM(CASE WHEN ${orders.type} = 'withdrawal' THEN 1 ELSE 0 END)`,
        refundOrders: sql<number>`SUM(CASE WHEN ${orders.type} = 'refund' THEN 1 ELSE 0 END)`,
      })
      .from(telegramUsers)
      .leftJoin(orders, eq(telegramUsers.id, orders.telegramUserId))
      .groupBy(telegramUsers.id, telegramUsers.username, telegramUsers.firstName, telegramUsers.role, telegramUsers.isActive, telegramUsers.createdAt);

    // Get customer statistics
    const customers = await db
      .select({
        customerName: orders.customerName,
        totalOrders: sql<number>`COUNT(*)`,
        totalAmount: sql<string>`COALESCE(SUM(CAST(${orders.amount} AS DECIMAL)), 0)::text`,
        depositCount: sql<number>`SUM(CASE WHEN ${orders.type} = 'deposit' THEN 1 ELSE 0 END)`,
        depositAmount: sql<string>`COALESCE(SUM(CASE WHEN ${orders.type} = 'deposit' THEN CAST(${orders.amount} AS DECIMAL) ELSE 0 END), 0)::text`,
        withdrawalCount: sql<number>`SUM(CASE WHEN ${orders.type} = 'withdrawal' THEN 1 ELSE 0 END)`,
        withdrawalAmount: sql<string>`COALESCE(SUM(CASE WHEN ${orders.type} = 'withdrawal' THEN CAST(${orders.amount} AS DECIMAL) ELSE 0 END), 0)::text`,
        refundCount: sql<number>`SUM(CASE WHEN ${orders.type} = 'refund' THEN 1 ELSE 0 END)`,
        refundAmount: sql<string>`COALESCE(SUM(CASE WHEN ${orders.type} = 'refund' THEN CAST(${orders.amount} AS DECIMAL) ELSE 0 END), 0)::text`,
        firstOrderDate: sql<string>`MIN(${orders.createdAt})`,
        lastOrderDate: sql<string>`MAX(${orders.createdAt})`,
      })
      .from(orders)
      .where(and(isNotNull(orders.customerName), ne(orders.customerName, '')))
      .groupBy(orders.customerName)
      .orderBy(sql`COUNT(*) DESC`);

    // Get project statistics
    const projects = await db
      .select({
        projectName: orders.projectName,
        totalOrders: sql<number>`COUNT(*)`,
        totalAmount: sql<string>`COALESCE(SUM(CAST(${orders.amount} AS DECIMAL)), 0)::text`,
        depositCount: sql<number>`SUM(CASE WHEN ${orders.type} = 'deposit' THEN 1 ELSE 0 END)`,
        depositAmount: sql<string>`COALESCE(SUM(CASE WHEN ${orders.type} = 'deposit' THEN CAST(${orders.amount} AS DECIMAL) ELSE 0 END), 0)::text`,
        withdrawalCount: sql<number>`SUM(CASE WHEN ${orders.type} = 'withdrawal' THEN 1 ELSE 0 END)`,
        withdrawalAmount: sql<string>`COALESCE(SUM(CASE WHEN ${orders.type} = 'withdrawal' THEN CAST(${orders.amount} AS DECIMAL) ELSE 0 END), 0)::text`,
        refundCount: sql<number>`SUM(CASE WHEN ${orders.type} = 'refund' THEN 1 ELSE 0 END)`,
        refundAmount: sql<string>`COALESCE(SUM(CASE WHEN ${orders.type} = 'refund' THEN CAST(${orders.amount} AS DECIMAL) ELSE 0 END), 0)::text`,
      })
      .from(orders)
      .where(and(isNotNull(orders.projectName), ne(orders.projectName, '')))
      .groupBy(orders.projectName)
      .orderBy(sql`COUNT(*) DESC`);

    // Get summary statistics
    const [summaryStats] = await db
      .select({
        totalOrders: sql<number>`COUNT(*)`,
        totalAmount: sql<string>`COALESCE(SUM(CAST(${orders.amount} AS DECIMAL)), 0)::text`,
        depositCount: sql<number>`SUM(CASE WHEN ${orders.type} = 'deposit' THEN 1 ELSE 0 END)`,
        depositAmount: sql<string>`COALESCE(SUM(CASE WHEN ${orders.type} = 'deposit' THEN CAST(${orders.amount} AS DECIMAL) ELSE 0 END), 0)::text`,
        withdrawalCount: sql<number>`SUM(CASE WHEN ${orders.type} = 'withdrawal' THEN 1 ELSE 0 END)`,
        withdrawalAmount: sql<string>`COALESCE(SUM(CASE WHEN ${orders.type} = 'withdrawal' THEN CAST(${orders.amount} AS DECIMAL) ELSE 0 END), 0)::text`,
        refundCount: sql<number>`SUM(CASE WHEN ${orders.type} = 'refund' THEN 1 ELSE 0 END)`,
        refundAmount: sql<string>`COALESCE(SUM(CASE WHEN ${orders.type} = 'refund' THEN CAST(${orders.amount} AS DECIMAL) ELSE 0 END), 0)::text`,
        pendingCount: sql<number>`SUM(CASE WHEN ${orders.status} = 'pending' THEN 1 ELSE 0 END)`,
        todayCount: sql<number>`SUM(CASE WHEN DATE(${orders.createdAt}) = CURRENT_DATE THEN 1 ELSE 0 END)`,
      })
      .from(orders);

    return {
      employees,
      customers,
      projects,
      summary: summaryStats,
    };
  }
}

export const storage = new DatabaseStorage();
