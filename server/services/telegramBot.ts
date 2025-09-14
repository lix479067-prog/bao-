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

  async setWebhook() {
    if (!this.botToken || !this.webhookUrl) {
      console.log('Bot token or webhook URL not configured');
      return false;
    }

    try {
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
    
    if (!chatId) return;

    // Handle activation keyboard
    if (data?.startsWith('numpad_')) {
      await this.handleNumpadInput(chatId, data.split('_')[1], callbackQuery.id);
      return;
    }

    // Handle admin code keyboard
    if (data?.startsWith('admin_code_')) {
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
    } else if (data?.startsWith('submit_')) {
      const reportType = data.split('_')[1] as 'deposit' | 'withdrawal' | 'refund';
      await this.startReportSubmission(chatId, telegramUser, reportType, callbackQuery.id);
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
    const template = await storage.getTemplateByType(reportType);
    
    if (!template) {
      await this.answerCallbackQuery(callbackQueryId, '模板未配置');
      return;
    }

    const typeNames = {
      deposit: '入款报备',
      withdrawal: '出款报备',
      refund: '退款报备'
    };

    await this.answerCallbackQuery(callbackQueryId, `${typeNames[reportType]}模板已发送`);
    
    const templateText = template.template
      .replace('{用户名}', telegramUser.username || telegramUser.firstName || '未知')
      .replace('{时间}', new Date().toLocaleString('zh-CN'));

    await this.sendMessage(
      chatId,
      `📋 ${typeNames[reportType]}模板\n\n请复制以下模板并填写相关信息后发送：\n\n${templateText}`,
      {
        inline_keyboard: [[
          { text: '✅ 提交报备', callback_data: `submit_${reportType}` },
          { text: '🔙 返回', callback_data: 'back_to_menu' }
        ]]
      }
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
      await storage.updateOrderStatus(orderId, status, approvedBy);
      
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
    let state = this.activationState.get(chatId);
    
    // Only perform recovery if state is truly lost
    if (!state) {
      // Get the telegram user to check if they're eligible for admin code entry
      const telegramUser = await storage.getTelegramUser(String(from.id));
      
      if (!telegramUser) {
        await this.answerCallbackQuery(callbackQueryId, '用户未找到，请重新开始');
        return;
      }
      
      // If user is already admin, no need for admin code
      if (telegramUser.role === 'admin') {
        await this.answerCallbackQuery(callbackQueryId, '您已经是管理员');
        await this.showAdminFeatureMenu(chatId, telegramUser);
        return;
      }
      
      // Reinitialize the admin code entry state only when truly lost
      state = { type: 'admin_code', code: '', user: telegramUser };
      this.activationState.set(chatId, state);
      
      // Only show recovery message when state was truly lost
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
      await this.answerCallbackQuery(callbackQueryId, '状态错误，请重新开始');
      this.activationState.delete(chatId);
      return;
    }

    let currentCode = state.code;

    if (input === 'cancel') {
      this.activationState.delete(chatId);
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
    await this.answerCallbackQuery(callbackQueryId, '');
    await this.editMessageReplyMarkup(chatId, this.getAdminCodeKeyboard(currentCode), 0);
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
    if (telegramUser.role === 'admin') {
      // If user is already admin, show admin menu
      await this.showAdminFeatureMenu(chatId, telegramUser);
    } else {
      // If user is not admin, show admin code keypad
      this.activationState.set(chatId, { type: 'admin_code', code: '', user: telegramUser });
      await this.sendMessage(
        chatId,
        '🔐 管理员权限提升\n\n请输入您的6位管理员激活码：',
        this.getAdminCodeKeyboard('')
      );
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
    await this.sendMessage(
      chatId,
      '已取消当前操作。',
      undefined,
      { remove_keyboard: true }
    );
  }

  // Report submission flow
  private async startReportSubmission(chatId: number, telegramUser: any, reportType: 'deposit' | 'withdrawal' | 'refund', callbackQueryId?: string) {
    this.reportState.set(chatId, {
      type: reportType,
      step: 'amount',
      data: { telegramUserId: telegramUser.id }
    });

    if (callbackQueryId) {
      await this.answerCallbackQuery(callbackQueryId, '请按照提示填写');
    }
    
    const typeNames = {
      deposit: '入款报备',
      withdrawal: '出款报备',
      refund: '退款报备'
    };
    
    await this.sendMessage(
      chatId,
      `📋 ${typeNames[reportType]}\n\n💵 请输入金额（仅数字）：`
    );
  }

  private async handleReportSubmission(chatId: number, telegramUser: any, text: string) {
    const state = this.reportState.get(chatId);
    if (!state) return;

    if (state.step === 'amount') {
      // Validate amount
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await this.sendMessage(chatId, '❌ 请输入有效的金额（大于0的数字）：');
        return;
      }
      
      state.data.amount = text;
      state.step = 'description';
      await this.sendMessage(chatId, '📝 请输入备注信息（可选，发送 "跳过" 省略）：');
    } else if (state.step === 'description') {
      const description = text === '跳过' ? '' : text;
      state.data.description = description;
      
      // Create order
      const order = await storage.createOrder({
        type: state.type,
        telegramUserId: state.data.telegramUserId,
        amount: state.data.amount,
        description: state.data.description,
        status: 'pending'
      });

      this.reportState.delete(chatId);

      // Send confirmation to employee
      await this.sendMessage(
        chatId,
        `✅ 报备提交成功！\n\n📝 订单号：${order.orderNumber}\n💵 金额：${order.amount}\n📅 时间：${new Date().toLocaleString('zh-CN')}\n\n请等待管理员审批。`,
        undefined,
        await this.getEmployeeReplyKeyboard()
      );

      // Notify admin groups
      await this.notifyAllAdminGroups(order);
    }
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

    await this.sendMessage(parseInt(groupId), message, keyboard);
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
      approved: '已确认',
      rejected: '已拒绝',
      pending: '待处理'
    };

    let message = `${statusEmojis[status as keyof typeof statusEmojis]} 您的报备订单状态已更新\n\n` +
      `📋 订单号：${order.orderNumber}\n` +
      `📊 状态：${statusNames[status as keyof typeof statusNames]}\n` +
      `⏰ 更新时间：${new Date().toLocaleString('zh-CN')}`;

    if (status === 'rejected' && order.rejectionReason) {
      message += `\n❌ 拒绝原因：${order.rejectionReason}`;
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
      // If no template, start direct submission
      await this.startReportSubmission(chatId, telegramUser, reportType);
      return;
    }
    
    const templateText = template.template
      .replace('{用户名}', telegramUser.username || telegramUser.firstName || '未知')
      .replace('{时间}', new Date().toLocaleString('zh-CN'));

    await this.sendMessage(
      chatId,
      `📋 ${typeNames[reportType]}模板\n\n请复制以下模板并填写相关信息后发送：\n\n${templateText}`,
      {
        inline_keyboard: [[
          { text: '✅ 提交报备', callback_data: `submit_${reportType}` },
          { text: '🔙 返回', callback_data: 'back_to_menu' }
        ]]
      }
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

    const statusEmojis = {
      approved: '✅',
      rejected: '❌',
      pending: '⏳'
    };

    const typeNames = {
      deposit: '入款',
      withdrawal: '出款',
      refund: '退款'
    };

    let message = '📜 您的报备历史（最近10条）:\n\n';
    
    for (const order of userOrders) {
      message += `${statusEmojis[order.status]} ${order.orderNumber}\n` +
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

    let message = '🔴 待审批列表（最近10条）:\n\n';
    
    for (const order of orders) {
      message += `📋 ${order.orderNumber}\n` +
        `   类型：${typeNames[order.type]}\n` +
        `   员工：${order.telegramUser.firstName || order.telegramUser.username || '未知'}\n` +
        `   金额：${order.amount}\n` +
        `   时间：${order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '未知'}\n\n`;
    }
    
    await this.sendMessage(chatId, message);
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

    const typeNames = {
      deposit: '入款',
      withdrawal: '出款',
      refund: '退款'
    };

    const statusEmojis = {
      approved: '✅',
      rejected: '❌',
      pending: '⏳'
    };

    let message = '📜 最近报备（最近10条）:\n\n';
    
    for (const order of orders) {
      message += `${statusEmojis[order.status]} ${order.orderNumber}\n` +
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

    // This would need the message ID to edit, which we don't have currently
    // For now, just send a new message
    await this.sendMessage(chatId, message);
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
