import { storage } from "../storage";
import type { Order, TelegramUser as DbTelegramUser } from "@shared/schema";
import { ADMIN_GROUP_ACTIVATION_KEY, DEFAULT_ADMIN_ACTIVATION_CODE } from "@shared/schema";
import { randomBytes } from "crypto";

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date: number;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

interface ReplyKeyboardMarkup {
  keyboard: string[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}

interface KeyboardRemove {
  remove_keyboard: boolean;
}

class TelegramBotService {
  private botToken: string = '';
  private webhookUrl: string = '';
  private webhookSecret: string = '';
  private adminGroupId: string = '';
  private baseUrl: string = 'https://api.telegram.org/bot';
  private activationState: Map<number, { type: 'admin' | 'employee' | 'admin_code', code: string, user?: any }> = new Map();
  private reportState: Map<number, { type: 'deposit' | 'withdrawal' | 'refund', step: string, data: any }> = new Map();
  private modifyState: Map<number, { orderId: string, originalContent: string, telegramUserId: string }> = new Map();
  
  // Clear stuck state for specific user
  clearUserState(chatId: number) {
    this.activationState.delete(chatId);
    this.reportState.delete(chatId);
    this.modifyState.delete(chatId);
    console.log(`[DEBUG] Cleared stuck state for user: ${chatId}`);
  }

  async initialize() {
    const config = await storage.getBotConfig();
    if (config) {
      this.botToken = config.botToken;
      this.webhookUrl = config.webhookUrl || '';
      this.adminGroupId = config.adminGroupId;
    }
    
    // Get or generate webhook secret
    const webhookSecretSetting = await storage.getSetting('TELEGRAM_WEBHOOK_SECRET');
    if (!webhookSecretSetting) {
      // Generate a random webhook secret
      this.webhookSecret = this.generateWebhookSecret();
      await storage.setSetting('TELEGRAM_WEBHOOK_SECRET', this.webhookSecret);
    } else {
      this.webhookSecret = webhookSecretSetting.value;
    }
  }
  
  private generateWebhookSecret(): string {
    // Generate a cryptographically secure random string
    return randomBytes(32).toString('hex');
  }
  
  getWebhookSecret(): string {
    return this.webhookSecret;
  }

  async getWebhookInfo() {
    if (!this.botToken) return null;
    
    try {
      const response = await fetch(`${this.baseUrl}${this.botToken}/getWebhookInfo`);
      const result = await response.json();
      return result.ok ? result.result : null;
    } catch (error) {
      console.error('Error getting webhook info:', error);
      return null;
    }
  }

  async setWebhook() {
    if (!this.botToken || !this.webhookUrl) {
      console.log('Bot token or webhook URL not configured');
      return false;
    }

    try {
      // Check current webhook status first to avoid unnecessary API calls
      const webhookInfo = await this.getWebhookInfo();
      if (webhookInfo && webhookInfo.url === this.webhookUrl) {
        console.log('Webhook already configured correctly, skipping');
        return true;
      }

      const response = await fetch(`${this.baseUrl}${this.botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: this.webhookUrl,
          secret_token: this.webhookSecret // Add secret token for webhook authentication
        })
      });

      const result = await response.json();
      console.log('Webhook set result:', result);
      return result.ok;
    } catch (error) {
      console.error('Error setting webhook:', error);
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.botToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}${this.botToken}/getMe`);
      const result = await response.json();
      return result.ok;
    } catch (error) {
      console.error('Error testing bot connection:', error);
      return false;
    }
  }

  async handleWebhook(update: TelegramUpdate) {
    console.log('[DEBUG] Webhook received:', {
      update_id: update.update_id,
      has_message: !!update.message,
      has_callback_query: !!update.callback_query,
      message_from_id: update.message?.from?.id,
      callback_from_id: update.callback_query?.from?.id,
      timestamp: new Date().toISOString()
    });
    
    try {
      if (update.message) {
        await this.handleMessage(update.message);
      } else if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
      }
    } catch (error) {
      console.error('Error handling webhook update:', error);
    }
  }

  private async handleMessage(message: TelegramMessage) {
    const text = message.text;
    const chatId = message.chat.id;
    const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';

    // Handle group commands
    if (isGroup) {
      if (text === '/activate') {
        await this.handleGroupActivation(chatId);
        return;
      }
      
      // Handle activation code input in groups
      const activationState = this.activationState.get(chatId);
      if (activationState && activationState.type === 'admin') {
        await this.handleAdminActivationCode(chatId, text || '');
        return;
      }
      return;
    }

    // Handle private messages
    const telegramUser = await this.getOrCreateTelegramUser(message.from);
    
    // Check if user is entering admin activation code
    const activationState = this.activationState.get(chatId);
    if (activationState && activationState.type === 'admin') {
      await this.handleAdminActivationPrivate(chatId, message.from, text || '');
      return;
    }

    // Check if user is in report submission flow
    const reportState = this.reportState.get(chatId);
    if (reportState) {
      await this.handleReportSubmission(chatId, telegramUser, text || '');
      return;
    }

    // Check if user is in order modification flow
    const modifyState = this.modifyState.get(chatId);
    if (modifyState) {
      await this.handleModifySubmission(chatId, telegramUser, text || '');
      return;
    }
    
    if (!telegramUser.isActive) {
      await this.sendMessage(chatId, '您的账户已被禁用，请联系管理员。');
      return;
    }

    // Handle commands
    if (text === '/start') {
      await this.handleStartCommand(chatId, telegramUser, message.from);
    } else if (text === '/cancel') {
      await this.handleCancelCommand(chatId);
    } else if (text === '👨‍💼 管理员') {
      await this.handleAdminButton(chatId, telegramUser);
    } else if (text === '👤 个人信息') {
      await this.handlePersonalInfo(chatId, telegramUser);
    } else if (text === '💰 入款报备') {
      await this.handleReportRequestByKeyboard(chatId, telegramUser, 'deposit');
    } else if (text === '💸 出款报备') {
      await this.handleReportRequestByKeyboard(chatId, telegramUser, 'withdrawal');
    } else if (text === '🔄 退款报备') {
      await this.handleReportRequestByKeyboard(chatId, telegramUser, 'refund');
    } else if (text === '📜 查看历史') {
      await this.handleViewHistory(chatId, telegramUser);
    } else if (text === '🔴 待审批列表') {
      await this.handlePendingOrders(chatId, telegramUser);
    } else if (text === '✅ 已审批列表') {
      await this.handleApprovedOrders(chatId, telegramUser);
    } else if (text === '👥 员工管理') {
      await this.handleEmployeeManagement(chatId, telegramUser);
    } else if (text === '📊 统计报表') {
      await this.handleStatsReport(chatId, telegramUser);
    } else if (text === '⚙️ 系统设置') {
      await this.handleSystemSettings(chatId, telegramUser);
    } else if (text?.startsWith('/')) {
      await this.handleUnknownCommand(chatId);
    }
  }

  private async handleStartCommand(chatId: number, telegramUser: any, from: TelegramUser) {
    // If user doesn't exist, create as employee by default
    if (!telegramUser) {
      telegramUser = await this.getOrCreateTelegramUser(from);
    }

    if (telegramUser.role === 'admin') {
      await this.sendMessage(
        chatId,
        '👋 您好，管理员！\n\n请选择操作：',
        undefined,
        await this.getAdminReplyKeyboard()
      );
    } else {
      await this.sendMessage(
        chatId,
        `👋 您好，${telegramUser.firstName || telegramUser.username || '员工'}！\n\n请选择操作：`,
        undefined,
        await this.getEmployeeReplyKeyboard()
      );
    }
  }

  private async handleCallbackQuery(callbackQuery: TelegramCallbackQuery) {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message?.chat.id;
    
    // DEBUG: Log all callback query details
    console.log('[DEBUG] handleCallbackQuery called:', {
      callback_data: data,
      chat_id: chatId,
      user_id: callbackQuery.from.id,
      user_name: callbackQuery.from.first_name,
      timestamp: new Date().toISOString()
    });
    
    if (!chatId) {
      console.log('[DEBUG] No chatId found in callback query');
      return;
    }

    // Handle activation keyboard
    if (data?.startsWith('numpad_')) {
      await this.handleNumpadInput(chatId, data.split('_')[1], callbackQuery.id);
      return;
    }

    // Handle admin code keyboard
    if (data?.startsWith('admin_code_')) {
      console.log('[DEBUG] Admin code callback detected:', {
        callback_data: data,
        extracted_input: data.split('_')[2],
        chat_id: chatId,
        user_id: callbackQuery.from.id
      });
      await this.handleAdminCodeInput(chatId, data.split('_')[2], callbackQuery.id, callbackQuery.from);
      return;
    }

    const telegramUser = await this.getOrCreateTelegramUser(callbackQuery.from);
    
    if (!telegramUser.isActive) {
      await this.answerCallbackQuery(callbackQuery.id, '您的账户已被禁用');
      return;
    }

    if (data?.startsWith('report_')) {
      const reportType = data.split('_')[1] as 'deposit' | 'withdrawal' | 'refund';
      await this.handleReportRequest(chatId, telegramUser, reportType, callbackQuery.id);
    // Remove old submit_ callback handler as it's no longer needed
    } else if (data === 'back_to_menu') {
      await this.handleBackToMenu(chatId, telegramUser, callbackQuery.id);
    } else if (data?.startsWith('approve_')) {
      const orderId = data.split('_')[1];
      // Check admin permission before allowing order approval
      const adminUser = await storage.getTelegramUser(String(callbackQuery.from.id));
      if (!adminUser || adminUser.role !== 'admin') {
        await this.answerCallbackQuery(callbackQuery.id, '无权限操作：仅管理员可以审批订单');
        return;
      }
      if (!adminUser.isActive) {
        await this.answerCallbackQuery(callbackQuery.id, '您的账户已被禁用');
        return;
      }
      await this.handleOrderApproval(chatId, orderId, 'approved', callbackQuery.id, callbackQuery.from);
    } else if (data?.startsWith('reject_')) {
      const orderId = data.split('_')[1];
      // Check admin permission before allowing order rejection
      const adminUser = await storage.getTelegramUser(String(callbackQuery.from.id));
      if (!adminUser || adminUser.role !== 'admin') {
        await this.answerCallbackQuery(callbackQuery.id, '无权限操作：仅管理员可以审批订单');
        return;
      }
      if (!adminUser.isActive) {
        await this.answerCallbackQuery(callbackQuery.id, '您的账户已被禁用');
        return;
      }
      await this.handleOrderApproval(chatId, orderId, 'rejected', callbackQuery.id, callbackQuery.from);
    } else if (data?.startsWith('approve_bot_')) {
      const orderId = data.split('_')[2]; // approve_bot_orderId
      // Check admin permission before allowing bot-side order approval
      const adminUser = await storage.getTelegramUser(String(callbackQuery.from.id));
      if (!adminUser || adminUser.role !== 'admin') {
        await this.answerCallbackQuery(callbackQuery.id, '无权限操作：仅管理员可以审批订单');
        return;
      }
      if (!adminUser.isActive) {
        await this.answerCallbackQuery(callbackQuery.id, '您的账户已被禁用');
        return;
      }
      await this.handleBotOrderApproval(chatId, orderId, 'approved', callbackQuery.id, callbackQuery.from);
    } else if (data?.startsWith('reject_bot_')) {
      const orderId = data.split('_')[2]; // reject_bot_orderId
      // Check admin permission before allowing bot-side order rejection
      const adminUser = await storage.getTelegramUser(String(callbackQuery.from.id));
      if (!adminUser || adminUser.role !== 'admin') {
        await this.answerCallbackQuery(callbackQuery.id, '无权限操作：仅管理员可以审批订单');
        return;
      }
      if (!adminUser.isActive) {
        await this.answerCallbackQuery(callbackQuery.id, '您的账户已被禁用');
        return;
      }
      await this.handleBotOrderApproval(chatId, orderId, 'rejected', callbackQuery.id, callbackQuery.from);
    } else if (data?.startsWith('modify_bot_')) {
      const orderId = data.split('_')[2]; // modify_bot_orderId
      // Check admin permission before allowing order modification
      const adminUser = await storage.getTelegramUser(String(callbackQuery.from.id));
      if (!adminUser || adminUser.role !== 'admin') {
        await this.answerCallbackQuery(callbackQuery.id, '无权限操作：仅管理员可以修改订单');
        return;
      }
      if (!adminUser.isActive) {
        await this.answerCallbackQuery(callbackQuery.id, '您的账户已被禁用');
        return;
      }
      await this.handleOrderModification(chatId, orderId, callbackQuery.id, adminUser);
    } else if (data?.startsWith('approve_admin_')) {
      const orderId = data.split('_')[2]; // approve_admin_orderId
      // Check admin permission before allowing admin bot approval
      const adminUser = await storage.getTelegramUser(String(callbackQuery.from.id));
      if (!adminUser || adminUser.role !== 'admin') {
        await this.answerCallbackQuery(callbackQuery.id, '无权限操作：仅管理员可以审批订单');
        return;
      }
      if (!adminUser.isActive) {
        await this.answerCallbackQuery(callbackQuery.id, '您的账户已被禁用');
        return;
      }
      await this.handleAdminBotOrderApproval(chatId, orderId, 'approved', callbackQuery.id, callbackQuery.from);
    } else if (data?.startsWith('reject_admin_')) {
      const orderId = data.split('_')[2]; // reject_admin_orderId
      // Check admin permission before allowing admin bot rejection
      const adminUser = await storage.getTelegramUser(String(callbackQuery.from.id));
      if (!adminUser || adminUser.role !== 'admin') {
        await this.answerCallbackQuery(callbackQuery.id, '无权限操作：仅管理员可以审批订单');
        return;
      }
      if (!adminUser.isActive) {
        await this.answerCallbackQuery(callbackQuery.id, '您的账户已被禁用');
        return;
      }
      await this.handleAdminBotOrderApproval(chatId, orderId, 'rejected', callbackQuery.id, callbackQuery.from);
    } else if (data === 'admin_stats') {
      await this.handleAdminStats(chatId, callbackQuery.id);
    } else if (data === 'admin_recent_reports') {
      await this.handleAdminRecentReports(chatId, callbackQuery.id);
    } else if (data === 'admin_pending_orders') {
      await this.handleAdminPendingOrdersCallback(chatId, callbackQuery.id);
    } else if (data === 'admin_approved_orders') {
      await this.handleAdminApprovedOrdersCallback(chatId, callbackQuery.id);
    } else if (data === 'admin_employee_management') {
      await this.handleAdminEmployeeManagementCallback(chatId, callbackQuery.id);
    } else if (data === 'admin_stats_report') {
      await this.handleAdminStatsReportCallback(chatId, callbackQuery.id);
    } else if (data === 'admin_system_settings') {
      await this.handleAdminSystemSettingsCallback(chatId, callbackQuery.id);
    } else if (data === 'back_to_main_menu') {
      await this.handleBackToMainMenu(chatId, telegramUser, callbackQuery.id);
    }
  }

  private async handleReportRequest(
    chatId: number,
    telegramUser: any,
    reportType: 'deposit' | 'withdrawal' | 'refund',
    callbackQueryId: string
  ) {
    // Check if user is disabled (blacklisted)
    if (!telegramUser.isActive) {
      await this.answerCallbackQuery(callbackQueryId, '❌ 账户已被禁用，无法提交报备。');
      await this.sendMessage(
        chatId,
        `❌ 账户已被禁用\n\n您的账户已被管理员禁用，无法使用报备功能。\n如有疑问，请联系管理员。`,
        undefined,
        await this.getEmployeeReplyKeyboard()
      );
      return;
    }

    const template = await storage.getTemplateByType(reportType);
    
    const typeNames = {
      deposit: '入款报备',
      withdrawal: '出款报备',
      refund: '退款报备'
    };

    if (!template) {
      await this.answerCallbackQuery(callbackQueryId, `❌ ${typeNames[reportType]}模板未配置，请联系管理员。`);
      return;
    }

    await this.answerCallbackQuery(callbackQueryId, `${typeNames[reportType]}模板已发送`);
    
    const templateText = template.template
      .replace('{用户名}', telegramUser.username || telegramUser.firstName || '未知')
      .replace('{时间}', new Date().toLocaleString('zh-CN'));

    // Set waiting state for template submission
    this.reportState.set(chatId, {
      type: reportType,
      step: 'waiting_template',
      data: { telegramUserId: telegramUser.id }
    });

    await this.sendMessage(
      chatId,
      `📋 ${typeNames[reportType]}模板\n\n请复制以下模板，填写完整信息后直接发送给我：\n\n${templateText}`
    );
  }

  private async handleOrderApproval(
    chatId: number,
    orderId: string,
    status: 'approved' | 'rejected',
    callbackQueryId: string,
    from?: TelegramUser
  ) {
    try {
      const order = await storage.getOrder(orderId);
      if (!order) {
        await this.answerCallbackQuery(callbackQueryId, '订单不存在');
        return;
      }

      if (order.status !== 'pending') {
        await this.answerCallbackQuery(callbackQueryId, '订单已处理');
        return;
      }

      // Get admin from callback query sender
      if (!from) {
        await this.answerCallbackQuery(callbackQueryId, '无法识别审批者');
        return;
      }
      
      const adminTelegramUser = await storage.getTelegramUser(String(from.id));
      
      // Verify that the user has admin role
      if (!adminTelegramUser || adminTelegramUser.role !== 'admin') {
        await this.answerCallbackQuery(callbackQueryId, '权限不足：仅管理员可以审批订单');
        return;
      }
      
      // Check if admin is active
      if (!adminTelegramUser.isActive) {
        await this.answerCallbackQuery(callbackQueryId, '您的账户已被禁用');
        return;
      }
      
      // Verify the approval is happening in an authorized admin group
      const adminGroup = await storage.getAdminGroup(String(chatId));
      if (!adminGroup || !adminGroup.isActive) {
        await this.answerCallbackQuery(callbackQueryId, '此群组未被授权进行审批操作');
        return;
      }

      // Use the actual admin's ID for approval tracking
      const approvedBy = adminTelegramUser.id;
      await storage.updateOrderStatus(orderId, status, approvedBy, undefined, 'group_chat');
      
      const statusText = status === 'approved' ? '已确认' : '已拒绝';
      await this.answerCallbackQuery(callbackQueryId, `订单${statusText}`);
      
      // Update the message to show the order has been processed
      await this.updateOrderMessageAfterApproval(chatId, order, status);
      
      // Notify the employee
      const employee = await storage.getTelegramUserById(order.telegramUserId);
      if (employee) {
        await this.notifyEmployee(employee, order, status);
      }

    } catch (error) {
      console.error('Error handling order approval:', error);
      await this.answerCallbackQuery(callbackQueryId, '处理失败');
    }
  }

  private async handleBotOrderApproval(
    chatId: number,
    orderId: string,
    status: 'approved' | 'rejected',
    callbackQueryId: string,
    from?: TelegramUser
  ) {
    try {
      const order = await storage.getOrder(orderId);
      if (!order) {
        await this.answerCallbackQuery(callbackQueryId, '订单不存在');
        return;
      }

      if (order.status !== 'pending') {
        await this.answerCallbackQuery(callbackQueryId, '订单已处理');
        return;
      }

      // Get admin from callback query sender
      if (!from) {
        await this.answerCallbackQuery(callbackQueryId, '无法识别审批者');
        return;
      }
      
      const adminTelegramUser = await storage.getTelegramUser(String(from.id));
      
      // Verify that the user has admin role
      if (!adminTelegramUser || adminTelegramUser.role !== 'admin') {
        await this.answerCallbackQuery(callbackQueryId, '权限不足：仅管理员可以审批订单');
        return;
      }
      
      // Check if admin is active
      if (!adminTelegramUser.isActive) {
        await this.answerCallbackQuery(callbackQueryId, '您的账户已被禁用');
        return;
      }

      // Use the actual admin's ID for approval tracking
      const approvedBy = adminTelegramUser.id;
      await storage.updateOrderStatus(orderId, status, approvedBy, undefined, 'bot_panel');
      
      const statusText = status === 'approved' ? '已确认' : '已拒绝';
      await this.answerCallbackQuery(callbackQueryId, `订单${statusText}`);
      
      // Update the order message to show it has been processed
      await this.updateBotOrderMessage(chatId, order, status, adminTelegramUser);
      
      // Notify the employee
      const employee = await storage.getTelegramUserById(order.telegramUserId);
      if (employee) {
        await this.notifyEmployee(employee, order, status);
      }

    } catch (error) {
      console.error('Error handling bot order approval:', error);
      await this.answerCallbackQuery(callbackQueryId, '处理失败');
    }
  }

  private async handleAdminBotOrderApproval(
    chatId: number,
    orderId: string,
    status: 'approved' | 'rejected',
    callbackQueryId: string,
    from?: TelegramUser
  ) {
    try {
      const order = await storage.getOrder(orderId);
      if (!order) {
        await this.answerCallbackQuery(callbackQueryId, '订单不存在');
        return;
      }

      if (order.status !== 'pending') {
        await this.answerCallbackQuery(callbackQueryId, '订单已处理');
        return;
      }

      // Get admin from callback query sender
      if (!from) {
        await this.answerCallbackQuery(callbackQueryId, '无法识别审批者');
        return;
      }
      
      const adminTelegramUser = await storage.getTelegramUser(String(from.id));
      
      // Verify that the user has admin role
      if (!adminTelegramUser || adminTelegramUser.role !== 'admin') {
        await this.answerCallbackQuery(callbackQueryId, '权限不足：仅管理员可以审批订单');
        return;
      }
      
      // Check if admin is active
      if (!adminTelegramUser.isActive) {
        await this.answerCallbackQuery(callbackQueryId, '您的账户已被禁用');
        return;
      }

      // Use the actual admin's ID for approval tracking - set as bot_private for admin bot approvals
      const approvedBy = adminTelegramUser.id;
      await storage.updateOrderStatus(orderId, status, approvedBy, undefined, 'bot_private');
      
      const statusText = status === 'approved' ? '已确认' : '已拒绝';
      await this.answerCallbackQuery(callbackQueryId, `订单${statusText}`);
      
      // Send admin confirmation message
      const typeNames: Record<string, string> = {
        deposit: '入款报备',
        withdrawal: '出款报备',
        refund: '退款报备'
      };
      
      const adminConfirmMessage = `✅ 审批完成

` +
        `📝 订单号：${order.orderNumber}
` +
        `📊 类型：${typeNames[order.type] || '未知'}
` +
        `💰 金额：${order.amount}
` +
        `👤 员工：${(await storage.getTelegramUserById(order.telegramUserId))?.firstName || '未知'}
` +
        `✅ 状态：${statusText}
` +
        `🕰️ 审批时间：${new Date().toLocaleString('zh-CN')}

` +
        `💸 员工已收到通知。`;
      
      await this.sendMessage(chatId, adminConfirmMessage);
      
      // Notify the employee
      const employee = await storage.getTelegramUserById(order.telegramUserId);
      if (employee) {
        await this.notifyEmployee(employee, order, status);
      }

    } catch (error) {
      console.error('Error handling admin bot order approval:', error);
      await this.answerCallbackQuery(callbackQueryId, '处理失败');
    }
  }

  private async handleOrderModification(
    chatId: number,
    orderId: string,
    callbackQueryId: string,
    adminTelegramUser: any
  ) {
    try {
      // Admin permissions have been verified in the callback handler

      // Get order details
      const order = await storage.getOrder(orderId);
      if (!order) {
        await this.answerCallbackQuery(callbackQueryId, '订单不存在');
        return;
      }

      if (order.status !== 'pending') {
        await this.answerCallbackQuery(callbackQueryId, '只能修改待审批的订单');
        return;
      }

      // Set modification state for the user
      this.modifyState.set(chatId, {
        orderId: orderId,
        originalContent: order.originalContent || '',
        telegramUserId: adminTelegramUser.id
      });

      await this.answerCallbackQuery(callbackQueryId, '开始修改订单');

      // Create pre-filled modification template
      const typeNames: Record<string, string> = {
        deposit: '入款报备',
        withdrawal: '出款报备',
        refund: '退款报备'
      };

      const modificationTemplate = `✏️ 订单修改 #${order.orderNumber}

📝 请编辑以下内容后发送：

${order.originalContent || '无原始内容'}

💡 提示：
• 修改完成后直接发送，订单将自动通过审批
• 发送 /cancel 可以取消修改操作
• 原始内容将被保留以供对比

📊 订单信息：
• 类型：${typeNames[order.type] || '未知'}
• 金额：${order.amount}
• 提交员工：${order.telegramUserId || '未知'}`;

      await this.sendMessage(chatId, modificationTemplate);

    } catch (error) {
      console.error('Error handling order modification:', error);
      await this.answerCallbackQuery(callbackQueryId, '处理失败');
    }
  }

  private async updateBotOrderMessage(
    chatId: number,
    order: any,
    status: 'approved' | 'rejected',
    admin: any
  ) {
    try {
      const typeNames: Record<string, string> = {
        deposit: '入款',
        withdrawal: '出款',
        refund: '退款'
      };

      const statusEmojis: Record<string, string> = {
        approved: '✅',
        rejected: '❌'
      };

      const telegramUser = await storage.getTelegramUser(order.telegramUserId);
      const employeeName = telegramUser?.firstName || telegramUser?.username || '未知';
      const submitTime = order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '未知';
      const processTime = new Date().toLocaleString('zh-CN');
      
      let messageText = `${statusEmojis[status]} 订单已处理 #${order.orderNumber}\n\n`;
      messageText += `📝 原始内容：\n${order.originalContent || '无内容'}\n\n`;
      messageText += `📊 类型：${typeNames[order.type] || '未知'}\n`;
      messageText += `💰 金额：${order.amount}\n`;
      messageText += `👤 提交员工：${employeeName}\n`;
      messageText += `⏰ 提交时间：${submitTime}\n`;
      messageText += `✅ 审批状态：${status === 'approved' ? '已确认' : '已拒绝'}\n`;
      messageText += `👨‍💼 审批人：${admin.firstName || admin.username || '管理员'}\n`;
      messageText += `🕐 处理时间：${processTime}`;

      // Try to edit the original message if we have the message ID
      if (order.groupMessageId) {
        const messageId = parseInt(order.groupMessageId);
        console.log(`[DEBUG] Attempting to edit bot order message ${messageId} in chat ${chatId}`);
        
        const editResult = await this.editMessageText(chatId, messageId, messageText);
        
        if (editResult && editResult.ok) {
          console.log(`[DEBUG] Successfully edited bot order message ${messageId} for order ${order.id}`);
          return;
        } else {
          console.error(`[DEBUG] Failed to edit bot order message ${messageId}:`, editResult);
        }
      } else {
        console.log(`[DEBUG] No groupMessageId found for bot order ${order.id}, sending new message`);
      }
      
      // Fallback: send a new message if editing failed or no message ID available
      await this.sendMessage(chatId, messageText);
      console.log(`[DEBUG] Sent new bot order message for order ${order.id} as fallback`);
      
    } catch (error) {
      console.error('Error updating bot order message:', error);
    }
  }

  private async getEmployeeKeyboard(): Promise<InlineKeyboardMarkup> {
    const buttons = await storage.getActiveKeyboardButtons();
    
    const keyboard: InlineKeyboardButton[][] = buttons.map(button => ([
      { text: button.text, callback_data: button.callbackData }
    ]));

    return { inline_keyboard: keyboard };
  }

  private async getAdminKeyboard(): Promise<InlineKeyboardMarkup> {
    return {
      inline_keyboard: [
        [{ text: '📊 查看统计', callback_data: 'admin_stats' }],
        [{ text: '🔧 管理面板', url: process.env.ADMIN_URL || 'https://admin.example.com' }]
      ]
    };
  }

  // Fixed Reply Keyboards
  private async getEmployeeReplyKeyboard(): Promise<ReplyKeyboardMarkup> {
    return {
      keyboard: [
        ['💰 入款报备', '💸 出款报备'],
        ['🔄 退款报备', '📜 查看历史'],
        ['👨‍💼 管理员', '👤 个人信息']
      ],
      resize_keyboard: true
    };
  }

  private async getAdminReplyKeyboard(): Promise<ReplyKeyboardMarkup> {
    return {
      keyboard: [
        ['🔴 待审批列表', '✅ 已审批列表'],
        ['👥 员工管理', '📊 统计报表'],
        ['⚙️ 系统设置', '❓ 帮助']
      ],
      resize_keyboard: true
    };
  }

  // Group activation methods
  private async handleGroupActivation(chatId: number) {
    // Check if group is already activated
    const existingGroup = await storage.getAdminGroup(String(chatId));
    if (existingGroup && existingGroup.isActive) {
      await this.sendMessage(chatId, '✅ 该群组已激活为管理群组！');
      return;
    }

    this.activationState.set(chatId, { type: 'admin', code: '' });
    await this.sendMessage(
      chatId,
      '🔐 请输入4位管理员激活码：',
      this.getNumpadKeyboard('')
    );
  }

  private getNumpadKeyboard(currentCode: string): InlineKeyboardMarkup {
    const display = currentCode.padEnd(4, '_').split('').join(' ');
    return {
      inline_keyboard: [
        [{ text: `当前输入: ${display}`, callback_data: 'ignore' }],
        [
          { text: '1', callback_data: 'numpad_1' },
          { text: '2', callback_data: 'numpad_2' },
          { text: '3', callback_data: 'numpad_3' }
        ],
        [
          { text: '4', callback_data: 'numpad_4' },
          { text: '5', callback_data: 'numpad_5' },
          { text: '6', callback_data: 'numpad_6' }
        ],
        [
          { text: '7', callback_data: 'numpad_7' },
          { text: '8', callback_data: 'numpad_8' },
          { text: '9', callback_data: 'numpad_9' }
        ],
        [
          { text: '*', callback_data: 'numpad_star' },
          { text: '0', callback_data: 'numpad_0' },
          { text: '#', callback_data: 'numpad_hash' }
        ],
        [
          { text: '⬅️ 删除', callback_data: 'numpad_delete' },
          { text: '✅ 确认', callback_data: 'numpad_confirm' },
          { text: '❌ 取消', callback_data: 'numpad_cancel' }
        ]
      ]
    };
  }

  private getAdminCodeKeyboard(currentCode: string): InlineKeyboardMarkup {
    const display = currentCode.padEnd(6, '_').split('').join(' ');
    return {
      inline_keyboard: [
        [{ text: `管理员激活码: ${display}`, callback_data: 'ignore' }],
        [
          { text: '1', callback_data: 'admin_code_1' },
          { text: '2', callback_data: 'admin_code_2' },
          { text: '3', callback_data: 'admin_code_3' }
        ],
        [
          { text: '4', callback_data: 'admin_code_4' },
          { text: '5', callback_data: 'admin_code_5' },
          { text: '6', callback_data: 'admin_code_6' }
        ],
        [
          { text: '7', callback_data: 'admin_code_7' },
          { text: '8', callback_data: 'admin_code_8' },
          { text: '9', callback_data: 'admin_code_9' }
        ],
        [
          { text: '*', callback_data: 'admin_code_star' },
          { text: '0', callback_data: 'admin_code_0' },
          { text: '#', callback_data: 'admin_code_hash' }
        ],
        [
          { text: '⬅️ 删除', callback_data: 'admin_code_delete' },
          { text: '✅ 确认', callback_data: 'admin_code_confirm' },
          { text: '❌ 取消', callback_data: 'admin_code_cancel' }
        ]
      ]
    };
  }

  private async handleNumpadInput(chatId: number, input: string, callbackQueryId: string) {
    const state = this.activationState.get(chatId);
    if (!state) {
      await this.answerCallbackQuery(callbackQueryId, '会话已过期');
      return;
    }

    let currentCode = state.code;

    if (input === 'cancel') {
      this.activationState.delete(chatId);
      await this.answerCallbackQuery(callbackQueryId, '已取消');
      await this.deleteMessage(chatId, 0); // Delete the numpad message
      return;
    } else if (input === 'delete') {
      currentCode = currentCode.slice(0, -1);
    } else if (input === 'confirm') {
      if (currentCode.length !== 4) {
        await this.answerCallbackQuery(callbackQueryId, '请输入完整的4位激活码');
        return;
      }
      
      // Verify activation code
      const systemCode = await storage.getSetting(ADMIN_GROUP_ACTIVATION_KEY);
      const validCode = systemCode?.value || DEFAULT_ADMIN_ACTIVATION_CODE;
      
      if (currentCode === validCode) {
        // Save admin group
        await storage.createAdminGroup({
          groupId: String(chatId),
          activationCode: currentCode
        });
        
        this.activationState.delete(chatId);
        await this.answerCallbackQuery(callbackQueryId, '激活成功！');
        await this.sendMessage(chatId, '✅ 群组已成功激活为管理群组！\n\n现在将接收所有待审批的报备订单。');
      } else {
        await this.answerCallbackQuery(callbackQueryId, '激活码错误');
        this.activationState.delete(chatId);
        await this.sendMessage(chatId, '❌ 激活码错误，请重新尝试。');
      }
      return;
    } else if (input === 'star') {
      currentCode += '*';
    } else if (input === 'hash') {
      currentCode += '#';
    } else if (input !== 'ignore') {
      currentCode += input;
    }

    // Limit to 4 characters
    if (currentCode.length > 4) {
      currentCode = currentCode.slice(0, 4);
    }

    state.code = currentCode;
    await this.answerCallbackQuery(callbackQueryId, '');
    await this.editMessageReplyMarkup(chatId, this.getNumpadKeyboard(currentCode), 0);
  }

  private async handleAdminCodeInput(chatId: number, input: string, callbackQueryId: string, from: TelegramUser) {
    console.log('[DEBUG] handleAdminCodeInput called:', {
      chat_id: chatId,
      input: input,
      callback_query_id: callbackQueryId,
      from_user_id: from.id,
      from_user_name: from.first_name,
      timestamp: new Date().toISOString()
    });
    
    let state = this.activationState.get(chatId);
    
    console.log('[DEBUG] Current activation state:', {
      chat_id: chatId,
      state_exists: !!state,
      state_type: state?.type,
      state_code: state?.code,
      state_user_id: state?.user?.id,
      activation_state_size: this.activationState.size,
      all_keys: Array.from(this.activationState.keys())
    });
    
    // Only perform recovery if state is truly lost
    if (!state) {
      console.log('[DEBUG] State not found, attempting recovery for chat_id:', chatId);
      // Get the telegram user to check if they're eligible for admin code entry
      const telegramUser = await storage.getTelegramUser(String(from.id));
      
      console.log('[DEBUG] Telegram user lookup result:', {
        user_id: from.id,
        user_found: !!telegramUser,
        user_role: telegramUser?.role,
        user_active: telegramUser?.isActive
      });
      
      if (!telegramUser) {
        console.log('[DEBUG] Telegram user not found, sending error response');
        await this.answerCallbackQuery(callbackQueryId, '用户未找到，请重新开始');
        return;
      }
      
      // If user is already admin, no need for admin code
      if (telegramUser.role === 'admin') {
        console.log('[DEBUG] User is already admin, showing admin menu');
        await this.answerCallbackQuery(callbackQueryId, '您已经是管理员');
        await this.showAdminFeatureMenu(chatId, telegramUser);
        return;
      }
      
      // Reinitialize the admin code entry state only when truly lost
      state = { type: 'admin_code', code: '', user: telegramUser };
      this.activationState.set(chatId, state);
      
      console.log('[DEBUG] State recreated and set:', {
        chat_id: chatId,
        new_state: state,
        activation_state_size_after: this.activationState.size
      });
      
      // Only show recovery message when state was truly lost
      console.log('[DEBUG] Sending recovery message to user');
      await this.answerCallbackQuery(callbackQueryId, '会话已恢复，请继续输入管理员激活码');
      
      // For recovery case, process the first input immediately
      if (input !== 'cancel' && !['delete', 'confirm', 'cancel'].includes(input)) {
        state.code = input === 'star' ? '*' : input === 'hash' ? '#' : (input !== 'ignore' ? input : '');
        await this.editMessageReplyMarkup(chatId, this.getAdminCodeKeyboard(state.code), 0);
        return;
      }
    }
    
    // Validate state type (this should normally not happen after proper initialization)
    if (state.type !== 'admin_code') {
      console.log('[DEBUG] Invalid state type detected:', {
        chat_id: chatId,
        expected_type: 'admin_code',
        actual_type: state.type,
        state: state
      });
      await this.answerCallbackQuery(callbackQueryId, '状态错误，请重新开始');
      this.activationState.delete(chatId);
      console.log('[DEBUG] State deleted due to invalid type');
      return;
    }

    let currentCode = state.code;
    
    console.log('[DEBUG] Processing input:', {
      chat_id: chatId,
      input: input,
      current_code: currentCode,
      current_code_length: currentCode.length
    });

    if (input === 'cancel') {
      console.log('[DEBUG] User cancelled admin code input');
      this.activationState.delete(chatId);
      console.log('[DEBUG] State deleted due to cancellation');
      await this.answerCallbackQuery(callbackQueryId, '已取消');
      await this.deleteMessage(chatId, 0); // Delete the keypad message
      return;
    } else if (input === 'delete') {
      currentCode = currentCode.slice(0, -1);
    } else if (input === 'confirm') {
      if (currentCode.length !== 6) {
        await this.answerCallbackQuery(callbackQueryId, '请输入完整的6位管理员激活码');
        return;
      }
      
      // Validate admin code using existing logic
      const employeeCode = await storage.getEmployeeCode(currentCode);
      
      if (!employeeCode) {
        await this.answerCallbackQuery(callbackQueryId, '激活码无效');
        this.activationState.delete(chatId);
        await this.sendMessage(chatId, '❌ 激活码无效，请联系管理员获取正确的激活码。');
        return;
      }

      if (employeeCode.type !== 'admin') {
        await this.answerCallbackQuery(callbackQueryId, '该激活码不是管理员码');
        this.activationState.delete(chatId);
        await this.sendMessage(chatId, '❌ 该激活码不是管理员码，请联系管理员获取管理员激活码。');
        return;
      }

      if (employeeCode.isUsed) {
        await this.answerCallbackQuery(callbackQueryId, '激活码已被使用');
        this.activationState.delete(chatId);
        await this.sendMessage(chatId, '❌ 该激活码已被使用，请联系管理员。');
        return;
      }

      if (new Date() > employeeCode.expiresAt) {
        await this.answerCallbackQuery(callbackQueryId, '激活码已过期');
        this.activationState.delete(chatId);
        await this.sendMessage(chatId, '❌ 激活码已过期，请联系管理员获取新的激活码。');
        return;
      }

      // Use the employee code
      await storage.useEmployeeCode(currentCode, String(state.user.telegramId));
      
      // Update user role to admin
      await storage.updateTelegramUser(state.user.id, {
        role: 'admin',
        firstName: employeeCode.name || state.user.firstName,
        isActive: true
      });

      await this.answerCallbackQuery(callbackQueryId, '管理员权限提升成功！');
      this.activationState.delete(chatId);
      
      await this.sendMessage(
        chatId,
        `✅ 管理员权限提升成功！\n\n欢迎 ${employeeCode.name || state.user.firstName}，您已成功获得管理员权限。\n\n请选择操作：`,
        undefined,
        await this.getAdminReplyKeyboard()
      );
      return;
    } else if (input === 'star') {
      currentCode += '*';
    } else if (input === 'hash') {
      currentCode += '#';
    } else if (input !== 'ignore') {
      currentCode += input;
    }

    // Limit to 6 characters
    if (currentCode.length > 6) {
      currentCode = currentCode.slice(0, 6);
    }

    state.code = currentCode;
    
    console.log('[DEBUG] Updated state code:', {
      chat_id: chatId,
      new_code: currentCode,
      new_code_length: currentCode.length
    });
    
    await this.answerCallbackQuery(callbackQueryId, '');
    await this.editMessageReplyMarkup(chatId, this.getAdminCodeKeyboard(currentCode), 0);
    
    console.log('[DEBUG] Keyboard updated successfully');
  }

  private async handleAdminActivationCode(chatId: number, text: string) {
    const state = this.activationState.get(chatId);
    if (!state || state.type !== 'admin') return;

    // Direct text input support
    if (text.length === 4) {
      const systemCode = await storage.getSetting(ADMIN_GROUP_ACTIVATION_KEY);
      const validCode = systemCode?.value || DEFAULT_ADMIN_ACTIVATION_CODE;
      
      if (text === validCode) {
        await storage.createAdminGroup({
          groupId: String(chatId),
          activationCode: text
        });
        
        this.activationState.delete(chatId);
        await this.sendMessage(chatId, '✅ 群组已成功激活为管理群组！\n\n现在将接收所有待审批的报备订单。');
      } else {
        this.activationState.delete(chatId);
        await this.sendMessage(chatId, '❌ 激活码错误，请使用 /activate 重新尝试。');
      }
    }
  }

  // Employee activation methods
  private async handleEmployeeActivation(chatId: number, from: TelegramUser, code: string) {
    if (code.length !== 6) {
      await this.sendMessage(chatId, '请输入正确的6位员工激活码：');
      return;
    }

    const employeeCode = await storage.getEmployeeCode(code);
    
    if (!employeeCode) {
      await this.sendMessage(chatId, '❌ 激活码无效，请联系管理员获取正确的激活码。');
      return;
    }

    if (employeeCode.isUsed) {
      await this.sendMessage(chatId, '❌ 该激活码已被使用，请联系管理员。');
      return;
    }

    if (new Date() > employeeCode.expiresAt) {
      await this.sendMessage(chatId, '❌ 激活码已过期，请联系管理员获取新的激活码。');
      return;
    }

    // Use the employee code
    await storage.useEmployeeCode(code, String(from.id));
    
    // Determine role based on code type
    const userRole = employeeCode.type === 'admin' ? 'admin' : 'employee';
    
    // Create or update telegram user
    let user = await storage.getTelegramUser(String(from.id));
    if (!user) {
      user = await storage.createTelegramUser({
        telegramId: String(from.id),
        username: from.username,
        firstName: employeeCode.name, // Use the name from employee code
        lastName: from.last_name,
        role: userRole
      });
    } else {
      user = await storage.updateTelegramUser(user.id, {
        firstName: employeeCode.name,
        role: userRole,
        isActive: true
      });
    }

    this.activationState.delete(chatId);
    
    const roleLabel = userRole === 'admin' ? '管理员' : '员工';
    const keyboard = userRole === 'admin' ? await this.getAdminReplyKeyboard() : await this.getEmployeeReplyKeyboard();
    
    await this.sendMessage(
      chatId,
      `✅ 激活成功！\n\n欢迎 ${employeeCode.name}，您已成功激活${roleLabel}身份。\n\n请选择操作：`,
      undefined,
      keyboard
    );
  }

  // Admin button handler
  private async handleAdminButton(chatId: number, telegramUser: any) {
    console.log('[DEBUG] handleAdminButton called:', {
      chat_id: chatId,
      user_role: telegramUser.role,
      user_id: telegramUser.id,
      user_name: telegramUser.firstName
    });
    
    if (telegramUser.role === 'admin') {
      console.log('[DEBUG] User is admin, showing admin feature menu');
      // If user is already admin, show admin menu
      await this.showAdminFeatureMenu(chatId, telegramUser);
    } else {
      console.log('[DEBUG] User is not admin, setting up admin code input state');
      // If user is not admin, show admin code keypad
      const newState = { type: 'admin_code' as const, code: '', user: telegramUser };
      this.activationState.set(chatId, newState);
      
      console.log('[DEBUG] Admin code state set:', {
        chat_id: chatId,
        state: newState,
        activation_state_size: this.activationState.size
      });
      
      await this.sendMessage(
        chatId,
        '🔐 管理员权限提升\n\n请输入您的6位管理员激活码：',
        this.getAdminCodeKeyboard('')
      );
      
      console.log('[DEBUG] Admin code keyboard sent');
    }
  }

  // Show admin feature menu
  private async showAdminFeatureMenu(chatId: number, telegramUser: any) {
    await this.sendMessage(
      chatId,
      '👨‍💼 管理员功能菜单\n\n请选择操作：',
      {
        inline_keyboard: [
          [{ text: '📜 查看最近报备', callback_data: 'admin_recent_reports' }],
          [{ text: '🔴 待确认订单', callback_data: 'admin_pending_orders' }],
          [{ text: '✅ 已审批订单', callback_data: 'admin_approved_orders' }],
          [{ text: '👥 员工管理', callback_data: 'admin_employee_management' }],
          [{ text: '📊 统计报表', callback_data: 'admin_stats_report' }],
          [{ text: '⚙️ 系统设置', callback_data: 'admin_system_settings' }],
          [{ text: '🔙 返回主菜单', callback_data: 'back_to_main_menu' }]
        ]
      }
    );
  }

  // Handle admin activation in private chat
  private async handleAdminActivationPrivate(chatId: number, from: TelegramUser, code: string) {
    if (code.length !== 6) {
      await this.sendMessage(chatId, '请输入正确的6位管理员激活码：');
      return;
    }

    const employeeCode = await storage.getEmployeeCode(code);
    
    if (!employeeCode) {
      await this.sendMessage(chatId, '❌ 激活码无效，请联系管理员获取正确的激活码。');
      this.activationState.delete(chatId);
      return;
    }

    if (employeeCode.type !== 'admin') {
      await this.sendMessage(chatId, '❌ 该激活码不是管理员码，请联系管理员获取管理员激活码。');
      this.activationState.delete(chatId);
      return;
    }

    if (employeeCode.isUsed) {
      await this.sendMessage(chatId, '❌ 该激活码已被使用，请联系管理员。');
      this.activationState.delete(chatId);
      return;
    }

    if (new Date() > employeeCode.expiresAt) {
      await this.sendMessage(chatId, '❌ 激活码已过期，请联系管理员获取新的激活码。');
      this.activationState.delete(chatId);
      return;
    }

    // Use the admin code
    await storage.useEmployeeCode(code, String(from.id));
    
    // Update user role to admin
    const user = await storage.getTelegramUser(String(from.id));
    if (user) {
      await storage.updateTelegramUser(user.id, {
        role: 'admin',
        firstName: employeeCode.name || user.firstName,
        isActive: true
      });
    }

    this.activationState.delete(chatId);
    
    await this.sendMessage(
      chatId,
      `✅ 管理员权限提升成功！\n\n欢迎 ${employeeCode.name || from.first_name}，您已成功获得管理员权限。\n\n请选择操作：`,
      undefined,
      await this.getAdminReplyKeyboard()
    );
  }

  // Cancel command
  private async handleCancelCommand(chatId: number) {
    this.activationState.delete(chatId);
    this.reportState.delete(chatId);
    this.modifyState.delete(chatId);
    await this.sendMessage(
      chatId,
      '已取消当前操作。',
      undefined,
      { remove_keyboard: true }
    );
  }

  // Notification methods for order modification
  private async notifyEmployeeOfModification(employee: any, order: any, modifiedContent: string, originalContent: string) {
    try {
      const typeNames: Record<string, string> = {
        deposit: '入款报备',
        withdrawal: '出款报备',  
        refund: '退款报备'
      };

      const adminName = await storage.getTelegramUserById(order.approvedBy);
      const adminDisplayName = adminName?.firstName || adminName?.username || '管理员';

      const message = `✅ 您的${typeNames[order.type] || '报备'}已通过审批（管理员有修改）

📋 订单号：${order.orderNumber}
📊 类型：${typeNames[order.type] || '未知'}
💰 金额：${order.amount}
👨‍💼 审批人：${adminDisplayName}
✏️ 修改时间：${order.modificationTime ? new Date(order.modificationTime).toLocaleString('zh-CN') : '未知'}

📝 您的原始内容：
${originalContent}

📝 修改后的内容：
${modifiedContent}

💡 注：管理员对您的原始内容进行了修改，请仔细查看两个版本的差异。`;

      await this.sendMessage(parseInt(employee.telegramId), message);
      
    } catch (error) {
      console.error('Error notifying employee of modification:', error);
    }
  }

  private async notifyAdminGroupsOfModification(order: any, admin: any, originalContent: string, modifiedContent: string) {
    try {
      const activeGroups = await storage.getActiveAdminGroups();
      
      if (activeGroups.length === 0) {
        console.log('No active admin groups to notify');
        return;
      }

      const typeNames: Record<string, string> = {
        deposit: '入款',
        withdrawal: '出款',
        refund: '退款'
      };

      const employee = await storage.getTelegramUserById(order.telegramUserId);
      const employeeName = employee?.firstName || employee?.username || '未知';
      const adminName = admin.firstName || admin.username || '管理员';

      const message = `✏️ 订单修改通知 #${order.orderNumber}

📊 类型：${typeNames[order.type] || '未知'}
💰 金额：${order.amount}
👤 提交员工：${employeeName}
👨‍💼 修改管理员：${adminName}
✏️ 修改时间：${new Date().toLocaleString('zh-CN')}

📝 原始内容：
${originalContent}

📝 修改后内容：
${modifiedContent}

✅ 状态：已通过（含修改）`;

      for (const group of activeGroups) {
        try {
          await this.sendMessage(parseInt(group.groupId), message);
        } catch (groupError) {
          console.error(`Error sending modification notification to group ${group.groupId}:`, groupError);
        }
      }

    } catch (error) {
      console.error('Error notifying admin groups of modification:', error);
    }
  }

  // Old startReportSubmission method removed - no longer needed with new template-based flow

  private async handleModifySubmission(chatId: number, telegramUser: any, text: string) {
    const state = this.modifyState.get(chatId);
    if (!state) return;

    try {
      // Verify admin permission (double check)
      if (telegramUser.role !== 'admin') {
        await this.sendMessage(chatId, '❌ 权限不足：仅管理员可以修改订单');
        this.modifyState.delete(chatId);
        return;
      }

      // Get the order to modify
      const order = await storage.getOrder(state.orderId);
      if (!order) {
        await this.sendMessage(chatId, '❌ 订单不存在');
        this.modifyState.delete(chatId);
        return;
      }

      if (order.status !== 'pending') {
        await this.sendMessage(chatId, '❌ 只能修改待审批的订单');
        this.modifyState.delete(chatId);
        return;
      }

      // Update order with modification
      const modifiedOrder = await storage.updateModifiedOrder(
        state.orderId,
        text, // modified content
        telegramUser.id, // approved by admin
        'bot_panel' // approval method
      );

      // Clear modification state
      this.modifyState.delete(chatId);

      // Send success message to admin
      await this.sendMessage(
        chatId,
        `✅ 订单修改成功！\n\n订单号：${modifiedOrder.orderNumber}\n✏️ 修改时间：${new Date().toLocaleString('zh-CN')}\n📋 状态：已通过（含修改）\n\n订单已自动通过审批并通知员工。`,
        undefined,
        await this.getAdminReplyKeyboard()
      );

      // Notify the employee about the modified order
      const employee = await storage.getTelegramUserById(order.telegramUserId);
      if (employee) {
        await this.notifyEmployeeOfModification(employee, modifiedOrder, text, state.originalContent);
      }

      // Notify admin groups about the modification
      await this.notifyAdminGroupsOfModification(modifiedOrder, telegramUser, state.originalContent, text);

    } catch (error) {
      console.error('Error handling order modification:', error);
      await this.sendMessage(
        chatId,
        `❌ 修改失败，请重试或联系技术支持。\n\n错误详情：${error instanceof Error ? error.message : '未知错误'}`
      );
      this.modifyState.delete(chatId);
    }
  }

  private async handleReportSubmission(chatId: number, telegramUser: any, text: string) {
    const state = this.reportState.get(chatId);
    if (!state) return;

    if (state.step === 'waiting_template') {
      // Check if user is disabled (blacklisted)
      if (!telegramUser.isActive) {
        this.reportState.delete(chatId);
        await this.sendMessage(
          chatId,
          `❌ 账户已被禁用\n\n您的账户已被管理员禁用，无法提交报备订单。\n如有疑问，请联系管理员。`,
          undefined,
          await this.getEmployeeReplyKeyboard()
        );
        return;
      }

      // User has submitted their filled template - create order directly
      const typeNames = {
        deposit: '入款报备',
        withdrawal: '出款报备',
        refund: '退款报备'
      };

      try {
        // Extract amount from the submitted content for backward compatibility
        // Look for patterns like "金额：123" or "Amount: 123" etc.
        const amountMatch = text.match(/(?:金额|amount|Amount|AMOUNT)[:：]\s*(\d+(?:\.\d+)?)/i);
        const extractedAmount = amountMatch ? amountMatch[1] : '0';

        // Create order with new schema fields
        const order = await storage.createOrder({
          type: state.type,
          telegramUserId: state.data.telegramUserId,
          amount: extractedAmount,
          description: '', // Keep empty as all info is in originalContent
          status: 'pending',
          originalContent: text, // Store the complete submitted template content
          approvalMethod: 'web_dashboard', // Set as requested
          isModified: false // Set as requested
        });

        this.reportState.delete(chatId);

        // Send confirmation to employee
        await this.sendMessage(
          chatId,
          `✅ ${typeNames[state.type]}提交成功！
          
📋 订单号：${order.orderNumber}
📊 类型：${typeNames[state.type]}
💰 金额：${extractedAmount}
📅 提交时间：${new Date().toLocaleString('zh-CN')}
⏳ 状态：等待管理员审批

💡 提示：您可以随时使用"📜 查看历史"功能查看订单状态。`,
          undefined,
          await this.getEmployeeReplyKeyboard()
        );

        // Notify admin groups
        await this.notifyAllAdminGroups(order);

      } catch (error) {
        console.error('Error creating order:', error);
        await this.sendMessage(
          chatId,
          `❌ 提交失败，请重试或联系管理员。\n\n错误详情：${error instanceof Error ? error.message : '未知错误'}`
        );
      }
    }
    // Remove old step-by-step logic as it's no longer needed
  }

  private async handleBackToMenu(chatId: number, telegramUser: any, callbackQueryId: string) {
    await this.answerCallbackQuery(callbackQueryId, '返回主菜单');
    
    if (telegramUser.role === 'admin') {
      await this.sendMessage(
        chatId,
        '请选择操作：',
        undefined,
        await this.getAdminReplyKeyboard()
      );
    } else {
      await this.sendMessage(
        chatId,
        '请选择操作：',
        undefined,
        await this.getEmployeeReplyKeyboard()
      );
    }
  }

  private async handleAdminStats(chatId: number, callbackQueryId: string) {
    await this.answerCallbackQuery(callbackQueryId, '加载中...');
    
    const stats = await storage.getDashboardStats();
    const message = `📊 统计数据\n\n` +
      `📅 今日订单：${stats.todayOrders}\n` +
      `⏳ 待处理：${stats.pendingOrders}\n` +
      `👥 活跃员工：${stats.activeEmployees}\n` +
      `📊 总订单数：${stats.totalOrders}`;
    
    await this.sendMessage(chatId, message);
  }

  // Notify all admin groups
  private async notifyAllAdminGroups(order: Order) {
    const adminGroups = await storage.getActiveAdminGroups();
    
    for (const group of adminGroups) {
      await this.sendAdminGroupNotification(order, group.groupId);
    }
  }

  private async sendAdminGroupNotification(order: Order, groupId: string) {
    const typeNames = {
      deposit: '💰 入款报备',
      withdrawal: '💸 出款报备',
      refund: '🔄 退款报备'
    };

    const employee = await storage.getTelegramUserById(order.telegramUserId);
    const employeeName = employee?.firstName || employee?.username || '未知员工';

    const message = `🔔 新的${typeNames[order.type]}\n\n` +
      `📝 订单号：${order.orderNumber}\n` +
      `👤 员工：${employeeName}\n` +
      `💵 金额：${order.amount}\n` +
      `📝 备注：${order.description || '无'}\n` +
      `⏰ 时间：${order.createdAt?.toLocaleString('zh-CN')}`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: '✅ 确认', callback_data: `approve_${order.id}` },
          { text: '❌ 拒绝', callback_data: `reject_${order.id}` }
        ]
      ]
    };

    try {
      const response = await this.sendMessage(parseInt(groupId), message, keyboard);
      
      // Save the message ID to the order for later editing
      if (response && response.ok && response.result && response.result.message_id) {
        await storage.updateOrderGroupMessageId(order.id, String(response.result.message_id));
        console.log(`[DEBUG] Saved message ID ${response.result.message_id} for order ${order.id}`);
      } else {
        console.error('[DEBUG] Failed to get message_id from sendMessage response:', response);
      }
    } catch (error) {
      console.error('Error sending admin group notification:', error);
    }
  }

  async notifyAdminGroup(order: Order) {
    // This method is now replaced by notifyAllAdminGroups
    await this.notifyAllAdminGroups(order);
  }

  async notifyOrderStatus(order: Order) {
    const employee = await storage.getTelegramUserById(order.telegramUserId);
    if (!employee) return;

    await this.notifyEmployee(employee, order, order.status);
  }

  private async notifyEmployee(employee: any, order: Order, status: string) {
    const statusEmojis = {
      approved: '✅',
      rejected: '❌', 
      pending: '⏳'
    };

    const statusNames = {
      approved: '已通过审批',
      rejected: '已被拒绝',
      pending: '待处理'
    };

    const typeNames: Record<string, string> = {
      deposit: '入款报备',
      withdrawal: '出款报备',
      refund: '退款报备'
    };

    // Get approver information
    let approverName = '系统';
    if (order.approvedBy) {
      const approver = await storage.getTelegramUserById(order.approvedBy);
      if (approver) {
        approverName = approver.firstName || approver.username || '管理员';
      } else {
        // Try to get from web admin system
        approverName = 'Web管理员';
      }
    }

    let message = `${statusEmojis[status as keyof typeof statusEmojis]} 您的${typeNames[order.type] || '报备'}${statusNames[status as keyof typeof statusNames]}\n\n` +
      `📋 订单号：${order.orderNumber}\n` +
      `📊 类型：${typeNames[order.type] || '未知类型'}\n` +
      `💰 金额：${order.amount}\n` +
      `👨‍💼 审批人：${approverName}\n` +
      `⏰ 审批时间：${order.approvedAt ? new Date(order.approvedAt).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN')}`;

    if (status === 'rejected' && order.rejectionReason) {
      message += `\n\n📝 拒绝原因：${order.rejectionReason}\n\n💡 提示：请根据拒绝原因修改后重新提交。`;
    } else if (status === 'approved') {
      message += `\n\n✅ 您的报备已成功通过审批，感谢您的配合。`;
    }

    await this.sendMessage(parseInt(employee.telegramId), message);
  }

  private async getOrCreateTelegramUser(telegramUser: TelegramUser) {
    let user = await storage.getTelegramUser(String(telegramUser.id));
    
    if (!user) {
      user = await storage.createTelegramUser({
        telegramId: String(telegramUser.id),
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        role: 'employee' // Default role, admins need to be configured manually
      });
    }
    
    return user;
  }

  private async sendMessage(
    chatId: number,
    text: string,
    inlineKeyboard?: InlineKeyboardMarkup,
    replyKeyboard?: ReplyKeyboardMarkup | KeyboardRemove
  ) {
    if (!this.botToken) return;

    try {
      const response = await fetch(`${this.baseUrl}${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          reply_markup: inlineKeyboard || replyKeyboard,
          parse_mode: 'HTML'
        })
      });

      return await response.json();
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  private async editMessageReplyMarkup(chatId: number, replyMarkup: InlineKeyboardMarkup, messageId: number) {
    if (!this.botToken) return;

    try {
      await fetch(`${this.baseUrl}${this.botToken}/editMessageReplyMarkup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          reply_markup: replyMarkup
        })
      });
    } catch (error) {
      console.error('Error editing message reply markup:', error);
    }
  }

  private async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    inlineKeyboard?: InlineKeyboardMarkup
  ) {
    if (!this.botToken) return;

    try {
      const response = await fetch(`${this.baseUrl}${this.botToken}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text,
          reply_markup: inlineKeyboard,
          parse_mode: 'HTML'
        })
      });

      return await response.json();
    } catch (error) {
      console.error('Error editing message text:', error);
      return null;
    }
  }

  private async deleteMessage(chatId: number, messageId: number) {
    if (!this.botToken || !messageId) return;

    try {
      await fetch(`${this.baseUrl}${this.botToken}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId
        })
      });
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }

  private async answerCallbackQuery(callbackQueryId: string, text: string) {
    if (!this.botToken) return;

    try {
      await fetch(`${this.baseUrl}${this.botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
          show_alert: false
        })
      });
    } catch (error) {
      console.error('Error answering callback query:', error);
    }
  }

  private async handleUnknownCommand(chatId: number) {
    await this.sendMessage(
      chatId,
      '抱歉，我不理解这个命令。请使用 /start 查看可用选项或 /help 查看帮助。'
    );
  }

  // New handler methods
  private async handleHelpCommand(chatId: number, telegramUser: any) {
    let helpText = '❓ 帮助信息\n\n';
    
    if (telegramUser.role === 'admin') {
      helpText += '👨‍💼 管理员功能：\n' +
        '• 🔴 待审批列表 - 查看所有待处理的报备\n' +
        '• ✅ 已审批列表 - 查看已处理的报备历史\n' +
        '• 👥 员工管理 - 管理员工信息\n' +
        '• 📊 统计报表 - 查看统计数据\n' +
        '• ⚙️ 系统设置 - 进入管理后台\n\n';
    }
    
    helpText += '👷 员工功能：\n' +
      '• 💰 入款报备 - 提交入款报备申请\n' +
      '• 💸 出款报备 - 提交出款报备申请\n' +
      '• 🔄 退款报备 - 提交退款报备申请\n' +
      '• 📜 查看历史 - 查看您的报备历史\n' +
      '• 👤 个人信息 - 查看个人账户信息\n\n' +
      '💡 使用提示：\n' +
      '• 输入 /cancel 可以取消当前操作\n' +
      '• 所有报备需要管理员审批后生效\n' +
      '• 审批结果会通过消息通知您';
    
    await this.sendMessage(chatId, helpText);
  }

  private async handlePersonalInfo(chatId: number, telegramUser: any) {
    const roleNames = {
      admin: '管理员',
      employee: '员工'
    };
    
    const info = `👤 个人信息\n\n` +
      `📛 姓名：${telegramUser.firstName || '未设置'}\n` +
      `👤 用户名：${telegramUser.username || '未设置'}\n` +
      `🆔 Telegram ID：${telegramUser.telegramId}\n` +
      `👔 角色：${roleNames[telegramUser.role as keyof typeof roleNames] || telegramUser.role}\n` +
      `✅ 状态：${telegramUser.isActive ? '已激活' : '已禁用'}\n` +
      `📅 注册时间：${telegramUser.createdAt ? new Date(telegramUser.createdAt).toLocaleString('zh-CN') : '未知'}`;
    
    await this.sendMessage(chatId, info);
  }

  private async handleReportRequestByKeyboard(
    chatId: number,
    telegramUser: any,
    reportType: 'deposit' | 'withdrawal' | 'refund'
  ) {
    const template = await storage.getTemplateByType(reportType);
    
    const typeNames = {
      deposit: '入款报备',
      withdrawal: '出款报备',
      refund: '退款报备'
    };

    if (!template) {
      await this.sendMessage(chatId, `❌ ${typeNames[reportType]}模板未配置，请联系管理员。`);
      return;
    }
    
    const templateText = template.template
      .replace('{用户名}', telegramUser.username || telegramUser.firstName || '未知')
      .replace('{时间}', new Date().toLocaleString('zh-CN'));

    // Set waiting state for template submission
    this.reportState.set(chatId, {
      type: reportType,
      step: 'waiting_template',
      data: { telegramUserId: telegramUser.id }
    });

    await this.sendMessage(
      chatId,
      `📋 ${typeNames[reportType]}模板\n\n请复制以下模板，填写完整信息后直接发送给我：\n\n${templateText}`
    );
  }

  private async handleViewHistory(chatId: number, telegramUser: any) {
    // Employees see their own orders
    const { orders } = await storage.getOrders({
      limit: 10,
      offset: 0
    });
    
    const userOrders = orders.filter(o => o.telegramUserId === telegramUser.id);
    
    if (userOrders.length === 0) {
      await this.sendMessage(chatId, '📜 您还没有提交过任何报备。');
      return;
    }

    const statusEmojis: Record<string, string> = {
      approved: '✅',
      rejected: '❌',
      pending: '⏳'
    };

    const typeNames: Record<string, string> = {
      deposit: '入款',
      withdrawal: '出款',
      refund: '退款'
    };

    let message = '📜 您的报备历史（最近10条）:\n\n';
    
    for (const order of userOrders) {
      message += `${statusEmojis[order.status] || '?'} ${order.orderNumber}\n` +
        `   类型：${typeNames[order.type]}\n` +
        `   金额：${order.amount}\n` +
        `   时间：${order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '未知'}\n\n`;
    }
    
    await this.sendMessage(chatId, message);
  }

  private async handlePendingOrders(chatId: number, telegramUser: any) {
    if (telegramUser.role !== 'admin') {
      await this.sendMessage(chatId, '❌ 您没有权限查看此内容。');
      return;
    }

    const { orders } = await storage.getOrdersWithUsers({
      status: 'pending',
      limit: 10
    });
    
    if (orders.length === 0) {
      await this.sendMessage(chatId, '🔴 当前没有待审批的报备。');
      return;
    }

    const typeNames = {
      deposit: '入款',
      withdrawal: '出款',
      refund: '退款'
    };

    // Send header message
    await this.sendMessage(chatId, `🔴 待审批列表：共 ${orders.length} 条待处理\n\n每个订单将单独发送，包含操作按钮：`);
    
    // Send individual messages for each order with interactive buttons
    for (const order of orders) {
      const employeeName = order.telegramUser.firstName || order.telegramUser.username || '未知';
      const submitTime = order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '未知';
      
      let messageText = `📋 订单详情 #${order.orderNumber}\n\n`;
      messageText += `📝 原始内容：\n${order.originalContent || '无内容'}\n\n`;
      messageText += `📊 类型：${typeNames[order.type]}\n`;
      messageText += `💰 金额：${order.amount}\n`;
      messageText += `👤 提交员工：${employeeName}\n`;
      messageText += `⏰ 提交时间：${submitTime}`;

      const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            { text: '✅ 确认', callback_data: `approve_bot_${order.id}` },
            { text: '❌ 拒绝', callback_data: `reject_bot_${order.id}` },
            { text: '✏️ 修改', callback_data: `modify_bot_${order.id}` }
          ]
        ]
      };

      await this.sendMessage(chatId, messageText, keyboard);
    }
  }

  private async handleApprovedOrders(chatId: number, telegramUser: any) {
    if (telegramUser.role !== 'admin') {
      await this.sendMessage(chatId, '❌ 您没有权限查看此内容。');
      return;
    }

    const { orders } = await storage.getOrdersWithUsers({
      status: 'approved',
      limit: 10
    });
    
    if (orders.length === 0) {
      await this.sendMessage(chatId, '✅ 还没有已审批的报备。');
      return;
    }

    const typeNames = {
      deposit: '入款',
      withdrawal: '出款',
      refund: '退款'
    };

    let message = '✅ 已审批列表（最近10条）:\n\n';
    
    for (const order of orders) {
      const dateToUse = order.approvedAt || order.createdAt;
      message += `✅ ${order.orderNumber}\n` +
        `   类型：${typeNames[order.type]}\n` +
        `   员工：${order.telegramUser.firstName || order.telegramUser.username || '未知'}\n` +
        `   金额：${order.amount}\n` +
        `   时间：${dateToUse ? new Date(dateToUse).toLocaleString('zh-CN') : '未知'}\n\n`;
    }
    
    await this.sendMessage(chatId, message);
  }

  private async handleEmployeeManagement(chatId: number, telegramUser: any) {
    if (telegramUser.role !== 'admin') {
      await this.sendMessage(chatId, '❌ 您没有权限查看此内容。');
      return;
    }

    const employees = await storage.getAllTelegramUsers();
    const activeEmployees = employees.filter(e => e.role === 'employee' && e.isActive);
    
    let message = `👥 员工管理\n\n` +
      `总员工数：${employees.filter(e => e.role === 'employee').length}\n` +
      `活跃员工：${activeEmployees.length}\n\n` +
      `员工列表：\n`;
    
    for (const emp of activeEmployees.slice(0, 10)) {
      message += `• ${emp.firstName || emp.username || '未知'} (@${emp.username || 'N/A'})\n`;
    }
    
    if (activeEmployees.length > 10) {
      message += `\n... 还有 ${activeEmployees.length - 10} 名员工`;
    }
    
    message += `\n\n💡 提示：请在管理后台进行详细的员工管理操作。`;
    
    await this.sendMessage(chatId, message);
  }

  private async handleStatsReport(chatId: number, telegramUser: any) {
    if (telegramUser.role !== 'admin') {
      await this.sendMessage(chatId, '❌ 您没有权限查看此内容。');
      return;
    }
    
    const stats = await storage.getDashboardStats();
    const message = `📊 统计报表\n\n` +
      `📅 今日订单：${stats.todayOrders}\n` +
      `⏳ 待处理：${stats.pendingOrders}\n` +
      `👥 活跃员工：${stats.activeEmployees}\n` +
      `📊 总订单数：${stats.totalOrders}\n\n` +
      `💡 详细报表请登录管理后台查看。`;
    
    await this.sendMessage(chatId, message);
  }

  private async handleSystemSettings(chatId: number, telegramUser: any) {
    if (telegramUser.role !== 'admin') {
      await this.sendMessage(chatId, '❌ 您没有权限访问系统设置。');
      return;
    }
    
    const adminUrl = process.env.ADMIN_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    await this.sendMessage(
      chatId,
      '⚙️ 系统设置\n\n请点击下方按钮进入管理后台进行系统设置：',
      {
        inline_keyboard: [[
          { text: '🔧 进入管理后台', url: adminUrl }
        ]]
      }
    );
  }

  // Admin menu callback handlers
  private async handleAdminRecentReports(chatId: number, callbackQueryId: string) {
    await this.answerCallbackQuery(callbackQueryId, '正在查询最近报备...');
    
    const { orders } = await storage.getOrdersWithUsers({
      limit: 10
    });
    
    if (orders.length === 0) {
      await this.sendMessage(chatId, '📜 最近没有报备记录。');
      return;
    }

    const typeNames: Record<string, string> = {
      deposit: '入款',
      withdrawal: '出款',
      refund: '退款'
    };

    const statusEmojis: Record<string, string> = {
      approved: '✅',
      rejected: '❌',
      pending: '⏳'
    };

    let message = '📜 最近报备（最近10条）:\n\n';
    
    for (const order of orders) {
      message += `${statusEmojis[order.status] || '?'} ${order.orderNumber}\n` +
        `   类型：${typeNames[order.type]}\n` +
        `   员工：${order.telegramUser.firstName || order.telegramUser.username || '未知'}\n` +
        `   金额：${order.amount}\n` +
        `   时间：${order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '未知'}\n\n`;
    }
    
    await this.sendMessage(chatId, message);
  }

  private async handleAdminPendingOrdersCallback(chatId: number, callbackQueryId: string) {
    await this.answerCallbackQuery(callbackQueryId, '正在查询待审批订单...');
    const telegramUser = { role: 'admin' }; // Simulated admin user for the existing method
    await this.handlePendingOrders(chatId, telegramUser);
  }

  private async handleAdminApprovedOrdersCallback(chatId: number, callbackQueryId: string) {
    await this.answerCallbackQuery(callbackQueryId, '正在查询已审批订单...');
    const telegramUser = { role: 'admin' }; // Simulated admin user for the existing method
    await this.handleApprovedOrders(chatId, telegramUser);
  }

  private async handleAdminEmployeeManagementCallback(chatId: number, callbackQueryId: string) {
    await this.answerCallbackQuery(callbackQueryId, '正在查询员工信息...');
    const telegramUser = { role: 'admin' }; // Simulated admin user for the existing method
    await this.handleEmployeeManagement(chatId, telegramUser);
  }

  private async handleAdminStatsReportCallback(chatId: number, callbackQueryId: string) {
    await this.answerCallbackQuery(callbackQueryId, '正在查询统计报表...');
    const telegramUser = { role: 'admin' }; // Simulated admin user for the existing method
    await this.handleStatsReport(chatId, telegramUser);
  }

  private async handleAdminSystemSettingsCallback(chatId: number, callbackQueryId: string) {
    await this.answerCallbackQuery(callbackQueryId, '正在访问系统设置...');
    const telegramUser = { role: 'admin' }; // Simulated admin user for the existing method
    await this.handleSystemSettings(chatId, telegramUser);
  }

  private async handleBackToMainMenu(chatId: number, telegramUser: any, callbackQueryId: string) {
    await this.answerCallbackQuery(callbackQueryId, '返回主菜单');
    
    if (telegramUser.role === 'admin') {
      await this.sendMessage(
        chatId,
        '👋 您好，管理员！\n\n请选择操作：',
        undefined,
        await this.getAdminReplyKeyboard()
      );
    } else {
      await this.sendMessage(
        chatId,
        `👋 您好，${telegramUser.firstName || telegramUser.username || '员工'}！\n\n请选择操作：`,
        undefined,
        await this.getEmployeeReplyKeyboard()
      );
    }
  }

  private async updateOrderMessageAfterApproval(chatId: number, order: Order, status: string) {
    const typeNames = {
      deposit: '💰 入款报备',
      withdrawal: '💸 出款报备',
      refund: '🔄 退款报备'
    };

    const statusEmojis = {
      approved: '✅ 已确认',
      rejected: '❌ 已拒绝'
    };

    const employee = await storage.getTelegramUserById(order.telegramUserId);
    const employeeName = employee?.firstName || employee?.username || '未知员工';

    const message = `${statusEmojis[status as keyof typeof statusEmojis]} ${typeNames[order.type]}\n\n` +
      `📝 订单号：${order.orderNumber}\n` +
      `👤 员工：${employeeName}\n` +
      `💵 金额：${order.amount}\n` +
      `📝 备注：${order.description || '无'}\n` +
      `📅 时间：${order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '未知'}\n` +
      `✅ 处理时间：${new Date().toLocaleString('zh-CN')}`;

    try {
      // Try to edit the original message if we have the message ID
      if (order.groupMessageId) {
        const messageId = parseInt(order.groupMessageId);
        console.log(`[DEBUG] Attempting to edit message ${messageId} in chat ${chatId}`);
        
        const editResult = await this.editMessageText(chatId, messageId, message);
        
        if (editResult && editResult.ok) {
          console.log(`[DEBUG] Successfully edited message ${messageId} for order ${order.id}`);
          return;
        } else {
          console.error(`[DEBUG] Failed to edit message ${messageId}:`, editResult);
        }
      } else {
        console.log(`[DEBUG] No groupMessageId found for order ${order.id}, sending new message`);
      }
      
      // Fallback: send a new message if editing failed or no message ID available
      await this.sendMessage(chatId, message);
      console.log(`[DEBUG] Sent new message for order ${order.id} as fallback`);
      
    } catch (error) {
      console.error('Error updating order message after approval:', error);
      // Final fallback: send a new message
      await this.sendMessage(chatId, message);
    }
  }
}

let telegramBot: TelegramBotService | null = null;

export async function setupTelegramBot() {
  try {
    telegramBot = new TelegramBotService();
    await telegramBot.initialize();
    await telegramBot.setWebhook();
    
    // Store globally for access in routes
    (global as any).telegramBot = telegramBot;
    
    console.log('Telegram bot initialized successfully');
  } catch (error) {
    console.error('Error setting up Telegram bot:', error);
  }
}

export { telegramBot };
