import { storage } from "../storage";
import type { Order, TelegramUser as DbTelegramUser } from "@shared/schema";

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

class TelegramBotService {
  private botToken: string = '';
  private webhookUrl: string = '';
  private adminGroupId: string = '';
  private baseUrl: string = 'https://api.telegram.org/bot';

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
    const telegramUser = await this.getOrCreateTelegramUser(message.from);
    
    if (!telegramUser.isActive) {
      await this.sendMessage(message.chat.id, '您的账户已被禁用，请联系管理员。');
      return;
    }

    const text = message.text;

    if (text === '/start') {
      await this.handleStartCommand(message.chat.id, telegramUser);
    } else if (text?.startsWith('/')) {
      await this.handleUnknownCommand(message.chat.id);
    }
  }

  private async handleStartCommand(chatId: number, telegramUser: any) {
    if (telegramUser.role === 'admin') {
      await this.sendMessage(
        chatId,
        '您好！管理员，欢迎使用报备机器人系统。\n\n您可以通过管理面板查看和处理所有报备订单。',
        await this.getAdminKeyboard()
      );
    } else {
      await this.sendMessage(
        chatId,
        `您好！${telegramUser.firstName || '员工'}，欢迎使用报备系统。\n\n请选择您要提交的报备类型：`,
        await this.getEmployeeKeyboard()
      );
    }
  }

  private async handleCallbackQuery(callbackQuery: TelegramCallbackQuery) {
    const telegramUser = await this.getOrCreateTelegramUser(callbackQuery.from);
    
    if (!telegramUser.isActive) {
      await this.answerCallbackQuery(callbackQuery.id, '您的账户已被禁用');
      return;
    }

    const data = callbackQuery.data;
    const chatId = callbackQuery.message?.chat.id;

    if (!chatId) return;

    if (data?.startsWith('report_')) {
      const reportType = data.split('_')[1] as 'deposit' | 'withdrawal' | 'refund';
      await this.handleReportRequest(chatId, telegramUser, reportType, callbackQuery.id);
    } else if (data?.startsWith('approve_')) {
      const orderId = data.split('_')[1];
      await this.handleOrderApproval(chatId, orderId, 'approved', callbackQuery.id);
    } else if (data?.startsWith('reject_')) {
      const orderId = data.split('_')[1];
      await this.handleOrderApproval(chatId, orderId, 'rejected', callbackQuery.id);
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
      
      // Update the message to show the new status
      await this.editMessageReplyMarkup(chatId, order, status);
      
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

  async notifyAdminGroup(order: Order) {
    if (!this.adminGroupId) return;

    const typeNames = {
      deposit: '💰 入款报备',
      withdrawal: '💸 出款报备',
      refund: '🔄 退款报备'
    };

    const employee = await storage.getTelegramUserById(order.telegramUserId);
    const employeeName = employee?.username || employee?.firstName || '未知员工';

    const message = `🔔 新的${typeNames[order.type]}\n\n` +
      `📋 订单号：${order.orderNumber}\n` +
      `👤 员工：${employeeName}\n` +
      `💵 金额：${order.amount}\n` +
      `📝 描述：${order.description || '无'}\n` +
      `⏰ 时间：${order.createdAt?.toLocaleString('zh-CN')}`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: '✅ 确认', callback_data: `approve_${order.id}` },
          { text: '❌ 拒绝', callback_data: `reject_${order.id}` }
        ]
      ]
    };

    await this.sendMessage(parseInt(this.adminGroupId), message, keyboard);
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

    const message = `${statusEmojis[status as keyof typeof statusEmojis]} 您的报备订单状态已更新\n\n` +
      `📋 订单号：${order.orderNumber}\n` +
      `📊 状态：${statusNames[status as keyof typeof statusNames]}\n` +
      `⏰ 更新时间：${new Date().toLocaleString('zh-CN')}`;

    if (status === 'rejected' && order.rejectionReason) {
      message + `\n❌ 拒绝原因：${order.rejectionReason}`;
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
    replyMarkup?: InlineKeyboardMarkup
  ) {
    if (!this.botToken) return;

    try {
      const response = await fetch(`${this.baseUrl}${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          reply_markup: replyMarkup,
          parse_mode: 'HTML'
        })
      });

      return await response.json();
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  private async editMessageReplyMarkup(chatId: number, order: Order, newStatus: string) {
    // Implementation for editing message markup after status change
    // This would update the inline keyboard to show the new status
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
