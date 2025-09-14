import { storage } from "../storage";
import type { Order, TelegramUser as DbTelegramUser } from "@shared/schema";
import { ADMIN_GROUP_ACTIVATION_KEY, DEFAULT_ADMIN_ACTIVATION_CODE } from "@shared/schema";

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
  private adminGroupId: string = '';
  private baseUrl: string = 'https://api.telegram.org/bot';
  private activationState: Map<number, { type: 'admin' | 'employee', code: string }> = new Map();
  private reportState: Map<number, { type: 'deposit' | 'withdrawal' | 'refund', step: string, data: any }> = new Map();

  async initialize() {
    const config = await storage.getBotConfig();
    if (config) {
      this.botToken = config.botToken;
      this.webhookUrl = config.webhookUrl || '';
      this.adminGroupId = config.adminGroupId;
    }
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
        body: JSON.stringify({ url: this.webhookUrl })
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
    
    // Check if user is entering employee code
    const activationState = this.activationState.get(chatId);
    if (activationState && activationState.type === 'employee') {
      await this.handleEmployeeActivation(chatId, message.from, text || '');
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

    if (text === '/start') {
      await this.handleStartCommand(chatId, telegramUser, message.from);
    } else if (text === '/cancel') {
      await this.handleCancelCommand(chatId);
    } else if (text?.startsWith('/')) {
      await this.handleUnknownCommand(chatId);
    }
  }

  private async handleStartCommand(chatId: number, telegramUser: any, from: TelegramUser) {
    // If user is not activated, prompt for employee code
    if (!telegramUser || telegramUser.role === 'employee' && !telegramUser.firstName) {
      this.activationState.set(chatId, { type: 'employee', code: '' });
      await this.sendMessage(
        chatId,
        '欢迎使用报备系统！\n\n请输入您的6位员工激活码：'
      );
      return;
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
        `👋 您好，${telegramUser.firstName || '员工'}！\n\n请选择操作：`,
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
      await this.handleOrderApproval(chatId, orderId, 'approved', callbackQuery.id);
    } else if (data?.startsWith('reject_')) {
      const orderId = data.split('_')[1];
      await this.handleOrderApproval(chatId, orderId, 'rejected', callbackQuery.id);
    } else if (data === 'admin_stats') {
      await this.handleAdminStats(chatId, callbackQuery.id);
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
    callbackQueryId: string
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

      // This would need to get admin info from the callback
      const adminTelegramUser = await storage.getTelegramUser(String(chatId));
      if (!adminTelegramUser || adminTelegramUser.role !== 'admin') {
        await this.answerCallbackQuery(callbackQueryId, '权限不足');
        return;
      }

      await storage.updateOrderStatus(orderId, status, adminTelegramUser.id);
      
      const statusText = status === 'approved' ? '已确认' : '已拒绝';
      await this.answerCallbackQuery(callbackQueryId, `订单${statusText}`);
      
      // Message status has been updated via callback query answer
      
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
        ['❓ 帮助', '👤 个人信息']
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
    
    // Create or update telegram user
    let user = await storage.getTelegramUser(String(from.id));
    if (!user) {
      user = await storage.createTelegramUser({
        telegramId: String(from.id),
        username: from.username,
        firstName: employeeCode.name, // Use the name from employee code
        lastName: from.last_name,
        role: 'employee'
      });
    } else {
      user = await storage.updateTelegramUser(user.id, {
        firstName: employeeCode.name,
        isActive: true
      });
    }

    this.activationState.delete(chatId);
    
    await this.sendMessage(
      chatId,
      `✅ 激活成功！\n\n欢迎 ${employeeCode.name}，您已成功激活员工身份。\n\n请选择操作：`,
      undefined,
      await this.getEmployeeReplyKeyboard()
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
  private async startReportSubmission(chatId: number, telegramUser: any, reportType: 'deposit' | 'withdrawal' | 'refund', callbackQueryId: string) {
    this.reportState.set(chatId, {
      type: reportType,
      step: 'amount',
      data: { telegramUserId: telegramUser.id }
    });

    await this.answerCallbackQuery(callbackQueryId, '请按照提示填写');
    await this.sendMessage(
      chatId,
      '💵 请输入金额（仅数字）：'
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
      '抱歉，我不理解这个命令。请使用 /start 查看可用选项。'
    );
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
