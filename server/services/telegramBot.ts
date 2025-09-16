import { storage } from "../storage";
import type { Order, TelegramUser as DbTelegramUser } from "@shared/schema";
import { ADMIN_GROUP_ACTIVATION_KEY, ADMIN_ACTIVATION_KEY, DEFAULT_ADMIN_ACTIVATION_CODE, DEFAULT_ADMIN_CODE } from "@shared/schema";
import { randomBytes } from "crypto";
import { OrderParser } from "./orderParser";
import { formatDateTimeBeijing } from "@shared/utils/timeUtils";

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
  entities?: TelegramMessageEntity[];
}

interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  user?: TelegramUser;
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
  private botUsername: string = '';
  private baseUrl: string = 'https://api.telegram.org/bot';
  private activationState: Map<number, { type: 'admin' | 'admin_code', code: string, user?: any, keyboardMessageId?: number }> = new Map();
  private reportState: Map<number, { type: 'deposit' | 'withdrawal' | 'refund', step: string, data: any }> = new Map();
  private modifyState: Map<number, { orderId: string, originalContent: string, telegramUserId: string }> = new Map();
  
  // Clear stuck state for specific user
  clearUserState(chatId: number) {
    this.activationState.delete(chatId);
    this.reportState.delete(chatId);
    this.modifyState.delete(chatId);
    console.log('[DEBUG] Cleared stuck state for user');
  }

  // Helper method to identify report button text patterns
  private isReportButtonText(text: string | undefined): { isButton: boolean, reportType?: 'deposit' | 'withdrawal' | 'refund' } {
    if (!text) return { isButton: false };
    
    const buttonPatterns = [
      { pattern: '💰 入款报备', type: 'deposit' as const },
      { pattern: '💸 出款报备', type: 'withdrawal' as const },
      { pattern: '🔄 退款报备', type: 'refund' as const }
    ];
    
    for (const { pattern, type } of buttonPatterns) {
      if (text === pattern) {
        return { isButton: true, reportType: type };
      }
    }
    
    return { isButton: false };
  }

  // Enhanced validation with specific guidance for each error type
  private validateReportContent(text: string, parseResult: any): { isValid: boolean, errorMessage?: string } {
    // Check minimum content length
    if (!text || text.trim().length < 30) {
      return {
        isValid: false,
        errorMessage: `📝 内容过短 - 需要更多信息

❌ 问题：提交内容少于30个字符
📏 当前字数：${text?.trim()?.length || 0} 字符

✅ 解决方案：
• 请填写完整的报备信息
• 至少包含客户、项目、金额三项核心信息
• 可以添加备注说明更多详情

💡 标准格式示例：
客户：张三
项目：VIP充值服务
金额：5000
备注：首次充值，享受优惠

🔄 取消操作：发送 /cancel 或 取消`
      };
    }

    // Check if content contains at least one valid colon-format field
    const hasValidFormat = this.hasValidColonFormatFields(text);
    if (!hasValidFormat) {
      return {
        isValid: false,
        errorMessage: `📋 格式错误 - 冒号格式不正确

❌ 问题：未检测到正确的字段格式
🔍 系统要求：使用中文冒号（：）分隔字段名和内容

✅ 正确格式：
客户：[客户姓名]    ← 使用中文冒号
项目：[项目名称]    ← 冒号后直接跟内容
金额：[具体数字]    ← 不要使用英文冒号

❌ 错误示例：
客户: 张三           ← 英文冒号
客户 张三            ← 缺少冒号
客户：              ← 冒号后无内容

💡 复制粘贴这个格式：
客户：张三
项目：VIP服务
金额：1000

🔄 取消操作：发送 /cancel 或 取消`
      };
    }

    // Check if OrderParser successfully extracted ALL THREE required fields
    const missingFields = [];
    
    if (!parseResult.customerName || parseResult.customerName.trim() === '') {
      missingFields.push('客户');
    }
    
    if (!parseResult.projectName || parseResult.projectName.trim() === '') {
      missingFields.push('项目');
    }
    
    if (!parseResult.amountExtracted || parseResult.amountExtracted.trim() === '' || parseFloat(parseResult.amountExtracted) <= 0) {
      missingFields.push('金额');
    }
    
    // If any required field is missing, reject the submission
    if (missingFields.length > 0 || parseResult.extractionStatus === 'failed') {
      const missingFieldsText = missingFields.join('、');
      return {
        isValid: false,
        errorMessage: `❌ 必填字段缺失或识别失败

🔍 未识别到的字段：${missingFieldsText}

📋 所有报备都必须包含以下三项核心信息：
• 客户：客户姓名或用户名
• 项目：具体项目或业务名称  
• 金额：准确的数字金额

✅ 正确格式示例：
客户：张三
项目：VIP充值服务
金额：5000
备注：可选补充信息

💡 常见问题解决：
• 使用中文冒号（：）不是英文冒号（:）
• 金额必须是纯数字，不要包含货币符号
• 客户和项目名称不能为空

🔄 取消操作：发送 /cancel 或 取消`
      };
    }

    // Check for common template patterns that indicate unfilled template
    if (this.isUnfilledTemplate(text)) {
      return {
        isValid: false,
        errorMessage: `⚠️ 模板未填写 - 发现占位符

❌ 问题：检测到未替换的模板占位符
🔍 发现：包含 {...}、[...]、___ 等模板标记

✅ 请按以下步骤操作：
1️⃣ 将 {用户名} 替换为真实客户姓名
2️⃣ 将 {项目} 替换为具体项目名称
3️⃣ 将 {金额} 替换为准确数字
4️⃣ 删除所有 [...] 占位符并填入真实信息
5️⃣ 将 ___ 替换为实际内容

💡 转换示例：
❌ 错误：客户：{用户名}
✅ 正确：客户：王五

❌ 错误：项目：[请填写项目名称]
✅ 正确：项目：高级会员服务

❌ 错误：金额：___元
✅ 正确：金额：2000

🔄 取消操作：发送 /cancel 或 取消
💬 需要帮助：联系管理员获取填写指导`
      };
    }

    return { isValid: true };
  }

  // Check if text contains valid colon-format fields
  private hasValidColonFormatFields(text: string): boolean {
    const colonPatterns = [
      /(?:客户|客户名|客户姓名|用户|用户名)[:：]\s*\S+/i,
      /(?:项目|项目名|业务|业务类型|服务)[:：]\s*\S+/i,
      /(?:金额|Amount|数量|总额|总金额|价格|费用)[:：]\s*\d+/i
    ];

    return colonPatterns.some(pattern => pattern.test(text));
  }

  // Check if content appears to be an unfilled template
  private isUnfilledTemplate(text: string): boolean {
    const templateIndicators = [
      /\{用户名\}/,
      /\{时间\}/,
      /\{[^}]+\}/,
      /\[\s*\]/,
      /（\s*）/,
      /___+/,
      /\.\.\.+/
    ];

    // Check for multiple template indicators
    const indicatorCount = templateIndicators.filter(pattern => pattern.test(text)).length;
    
    // If 2 or more template indicators are found, likely unfilled template
    return indicatorCount >= 2;
  }

  // Handle today's order summary
  private async handleTodaySummary(chatId: number): Promise<void> {
    try {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      
      const summary = await this.getOrderSummary(todayStart, todayEnd, '今日');
      await this.sendMessage(chatId, summary);
    } catch (error) {
      console.error('Error getting today summary:', error);
      await this.sendMessage(chatId, '❌ 获取今日汇总失败，请稍后重试');
    }
  }

  // Handle this week's order summary
  private async handleWeeklySummary(chatId: number): Promise<void> {
    try {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const weekStart = new Date(today.getTime() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) * 24 * 60 * 60 * 1000);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      
      const summary = await this.getOrderSummary(weekStart, weekEnd, '本周');
      await this.sendMessage(chatId, summary);
    } catch (error) {
      console.error('Error getting week summary:', error);
      await this.sendMessage(chatId, '❌ 获取本周汇总失败，请稍后重试');
    }
  }

  // Handle this month's order summary
  private async handleMonthlySummary(chatId: number): Promise<void> {
    try {
      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
      
      const summary = await this.getOrderSummary(monthStart, monthEnd, '本月');
      await this.sendMessage(chatId, summary);
    } catch (error) {
      console.error('Error getting month summary:', error);
      await this.sendMessage(chatId, '❌ 获取本月汇总失败，请稍后重试');
    }
  }

  // Get order summary for a date range
  private async getOrderSummary(startDate: Date, endDate: Date, period: string): Promise<string> {
    try {
      // Get orders for the period
      const { orders } = await storage.getOrdersWithUsers({
        limit: 1000
      });
      
      // Filter orders by date range
      const periodOrders = orders.filter(order => {
        if (!order.createdAt) return false;
        const orderDate = new Date(order.createdAt);
        return orderDate >= startDate && orderDate <= endDate;
      });
      
      // Group by status
      const approved = periodOrders.filter(o => o.status === 'approved');
      const pending = periodOrders.filter(o => o.status === 'pending');
      const rejected = periodOrders.filter(o => o.status === 'rejected');
      
      // Group by type
      const deposit = periodOrders.filter(o => o.type === 'deposit');
      const withdrawal = periodOrders.filter(o => o.type === 'withdrawal');
      const refund = periodOrders.filter(o => o.type === 'refund');
      
      // Calculate total amount for approved orders
      const totalAmount = approved.reduce((sum, order) => {
        const amount = parseFloat(order.amount) || 0;
        return sum + amount;
      }, 0);
      
      const formatDate = (date: Date) => {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      };
      
      return `📊 ${period}订单汇总

📅 统计周期：${formatDate(startDate)} 至 ${formatDate(endDate)}

📈 总体数据：
• 总订单数：${periodOrders.length} 单
• 已通过：${approved.length} 单
• 待审核：${pending.length} 单
• 已拒绝：${rejected.length} 单
• 总金额：¥${totalAmount.toLocaleString()}

📋 订单类型：
• 💰 入款：${deposit.length} 单
• 💸 出款：${withdrawal.length} 单
• 🔄 退款：${refund.length} 单

⏰ 生成时间：${formatDateTimeBeijing(new Date())}`;
    } catch (error) {
      console.error('Error generating order summary:', error);
      return `❌ 获取${period}汇总数据失败`;
    }
  }

  // Handle report button clicks during waiting states
  private async handleReportButtonClickDuringWaiting(
    chatId: number, 
    telegramUser: any, 
    reportType: 'deposit' | 'withdrawal' | 'refund'
  ) {
    const typeNames = {
      deposit: '入款报备',
      withdrawal: '出款报备',
      refund: '退款报备'
    };

    // Clear the current waiting state
    this.reportState.delete(chatId);
    
    // Provide user-friendly feedback
    const resetMessage = `🔄 检测到您点击了 ${typeNames[reportType]} 按钮
    
📋 已重新开始报备流程，之前等待的状态已清除。

💡 提示：如果您想要提交之前的模板，请重新填写并发送。`;

    await this.sendMessage(chatId, resetMessage);
    
    // Start new report flow
    await this.handleReportRequestByKeyboard(chatId, telegramUser, reportType);
  }

  async initialize() {
    const config = await storage.getBotConfig();
    if (config) {
      this.botToken = config.botToken;
      // 🚀 OPTIMIZATION: Use environment variable for webhook URL (faster than DB query)
      this.webhookUrl = this.getOptimalWebhookUrl(config.webhookUrl || undefined);
      this.adminGroupId = config.adminGroupId;
      
      // Get bot username for @mention detection
      await this.getBotUsername();
    }
    
    // 🚀 OPTIMIZATION: Use environment variable for webhook secret (faster than DB query)
    this.webhookSecret = await this.getOptimalWebhookSecret();
  }
  
  // Get optimal webhook URL based on environment (priority: env var > config > auto-generate)
  private getOptimalWebhookUrl(configUrl?: string): string {
    // Priority 1: Environment variable (fastest for production)
    if (process.env.TELEGRAM_WEBHOOK_URL) {
      console.log('[TelegramBot] Using webhook URL from environment variable');
      return process.env.TELEGRAM_WEBHOOK_URL;
    }
    
    // Priority 2: Config from database
    if (configUrl) {
      console.log('[TelegramBot] Using webhook URL from database config');
      return configUrl;
    }
    
    // Priority 3: Auto-generate from REPLIT_DOMAINS (for development)
    if (process.env.REPLIT_DOMAINS) {
      const domain = process.env.REPLIT_DOMAINS.split(',')[0];
      const autoUrl = `https://${domain}/api/telegram/webhook`;
      console.log('[TelegramBot] Auto-generated webhook URL:', autoUrl);
      return autoUrl;
    }
    
    console.warn('[TelegramBot] No webhook URL configured!');
    return '';
  }
  
  // Get optimal webhook secret (priority: env var > database > generate new)
  private async getOptimalWebhookSecret(): Promise<string> {
    // Priority 1: Environment variable (fastest)
    if (process.env.TELEGRAM_WEBHOOK_SECRET) {
      console.log('[TelegramBot] Using webhook secret from environment variable');
      return process.env.TELEGRAM_WEBHOOK_SECRET;
    }
    
    // Priority 2: Database setting
    const webhookSecretSetting = await storage.getSetting('TELEGRAM_WEBHOOK_SECRET');
    if (webhookSecretSetting) {
      return webhookSecretSetting.value;
    }
    
    // Priority 3: Generate new and save to database
    const newSecret = this.generateWebhookSecret();
    await storage.setSetting('TELEGRAM_WEBHOOK_SECRET', newSecret);
    console.log('[TelegramBot] Generated new webhook secret and saved to database');
    return newSecret;
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

  private async getBotUsername(): Promise<void> {
    if (!this.botToken) return;

    try {
      const response = await fetch(`${this.baseUrl}${this.botToken}/getMe`);
      const result = await response.json();
      if (result.ok && result.result.username) {
        this.botUsername = result.result.username;
        console.log('[DEBUG] Bot username:', this.botUsername);
      }
    } catch (error) {
      console.error('Error getting bot username:', error);
    }
  }

  // Extract @bot command from message
  private extractBotCommand(message: TelegramMessage): string | null {
    if (!message.text || !message.entities || !this.botUsername) {
      return null;
    }

    // Check for @bot mentions in entities
    const botMention = message.entities.find(entity => 
      entity.type === 'mention' && 
      message.text!.substring(entity.offset, entity.offset + entity.length) === `@${this.botUsername}`
    );

    if (!botMention) {
      return null;
    }

    // Extract command text after @bot mention
    const commandStart = botMention.offset + botMention.length;
    const commandText = message.text.substring(commandStart).trim();
    
    console.log('[DEBUG] Bot command detected:', commandText);
    return commandText || null;
  }

  // Handle @bot commands in groups
  private async handleBotCommand(chatId: number, command: string): Promise<void> {
    console.log('[DEBUG] Processing bot command:', command);

    switch (command) {
      case '激活群聊':
        await this.handleGroupActivation(chatId);
        break;
      
      case '今日汇总':
        await this.handleTodaySummary(chatId);
        break;
      
      case '本周汇总':
        await this.handleWeeklySummary(chatId);
        break;
      
      case '本月汇总':
        await this.handleMonthlySummary(chatId);
        break;
      
      case '帮助':
      case 'help':
        await this.handleBotHelp(chatId);
        break;
      
      default:
        await this.sendMessage(chatId, `❓ 未知命令："${command}"

📋 可用命令：
• @${this.botUsername} 激活群聊
• @${this.botUsername} 今日汇总
• @${this.botUsername} 本周汇总
• @${this.botUsername} 本月汇总
• @${this.botUsername} 帮助`);
        break;
    }
  }

  // Handle bot help command
  private async handleBotHelp(chatId: number): Promise<void> {
    const helpMessage = `🤖 机器人命令帮助

📋 可用命令：
• @${this.botUsername} 激活群聊 - 激活当前群聊的管理权限
• @${this.botUsername} 今日汇总 - 查看今日订单汇总
• @${this.botUsername} 本周汇总 - 查看本周订单汇总
• @${this.botUsername} 本月汇总 - 查看本月订单汇总
• @${this.botUsername} 帮助 - 显示此帮助信息

💡 提示：直接@机器人并输入命令即可使用`;
    
    await this.sendMessage(chatId, helpMessage);
  }

  async handleWebhook(update: TelegramUpdate) {
    console.log('[DEBUG] Webhook received:', {
      update_id: update.update_id,
      has_message: !!update.message,
      has_callback_query: !!update.callback_query,
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
      // Check for @bot mentions first
      const botCommand = this.extractBotCommand(message);
      if (botCommand) {
        await this.handleBotCommand(chatId, botCommand);
        return;
      }
      
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

    // PRIORITY: Check for cancel commands first (before any state processing)
    if (text === '/cancel' || text === '取消' || text === '退出') {
      await this.handleCancelCommand(chatId, telegramUser);
      return;
    }
    

    // OPTIMIZATION: Check if message is a report button click BEFORE processing states
    const buttonCheck = this.isReportButtonText(text);
    
    // Check if user is in report submission flow
    const reportState = this.reportState.get(chatId);
    if (reportState) {
      // If user clicks a report button while waiting, reset state and restart flow
      if (buttonCheck.isButton && buttonCheck.reportType) {
        await this.handleReportButtonClickDuringWaiting(chatId, telegramUser, buttonCheck.reportType);
        return;
      }
      // Otherwise, process as template submission
      await this.handleReportSubmission(chatId, telegramUser, text || '');
      return;
    }

    // Check if user is in order modification flow
    const modifyState = this.modifyState.get(chatId);
    if (modifyState) {
      // If user clicks a report button while in modify state, clear state and handle button
      if (buttonCheck.isButton && buttonCheck.reportType) {
        this.modifyState.delete(chatId);
        await this.sendMessage(
          chatId, 
          '📝 已取消订单修改，重新开始报备流程...'
        );
        await this.handleReportRequestByKeyboard(chatId, telegramUser, buttonCheck.reportType);
        return;
      }
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
      const adminMessage = `👋 您好，管理员 ${telegramUser.firstName || telegramUser.username || ''}！

🎯 管理员功能指南：

📋 订单管理：
• 🔴 待审批列表 - 查看并处理待审批订单
• ✅ 已审批列表 - 查看已处理的订单历史

👥 人员管理：
• 👥 员工管理 - 查看员工状态和信息
• 📊 统计报表 - 查看系统运营数据

⚙️ 系统功能：
• ⚙️ 系统设置 - 进入管理后台配置
• 👤 个人信息 - 查看您的账户信息

💡 快速操作提示：
• 在群组中可直接审批员工提交的订单
• 使用按钮快速访问各项功能
• 如需帮助请查看管理后台文档

请选择您需要的操作：`;

      await this.sendMessage(
        chatId,
        adminMessage,
        undefined,
        await this.getAdminReplyKeyboard()
      );
    } else {
      const employeeMessage = `👋 您好，${telegramUser.firstName || telegramUser.username || '员工'}！

🎯 员工功能指南：

💰 报备功能：
• 💰 入款报备 - 提交客户入款信息
• 💸 出款报备 - 提交客户出款信息  
• 🔄 退款报备 - 提交退款处理信息

📖 查询功能：
• 📜 查看历史 - 查看您的报备记录和状态
• 👤 个人信息 - 查看您的账户信息

🚀 快速上手：
1️⃣ 点击对应的报备类型按钮
2️⃣ 按照模板格式填写信息
3️⃣ 发送后等待管理员审批
4️⃣ 审批结果会及时通知您

💡 使用技巧：
• 填写信息要准确完整，避免审批失败
• 可同时提交多个不同类型的报备
• 遇到问题可使用 /cancel 取消当前操作
• 如需帮助请联系管理员

请选择您需要的操作：`;

      await this.sendMessage(
        chatId,
        employeeMessage,
        undefined,
        await this.getEmployeeReplyKeyboard()
      );
    }
  }

  private async handleCallbackQuery(callbackQuery: TelegramCallbackQuery) {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message?.chat.id;
    
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
      .replace('{时间}', formatDateTimeBeijing(new Date()));

    // Set waiting state for template submission
    this.reportState.set(chatId, {
      type: reportType,
      step: 'waiting_template',
      data: { telegramUserId: telegramUser.id }
    });

    // Enhanced template message with detailed guidance
    const guidanceMessage = `📋 ${typeNames[reportType]}模板\n\n` +
      `📝 填写指南：\n` +
      `✅ 必填字段：客户姓名、项目名称、具体金额\n` +
      `📌 格式要求：使用中文冒号（：）分隔字段和内容\n\n` +
      `💡 正确格式示例：\n` +
      `客户：张三\n` +
      `项目：VIP充值服务\n` +
      `金额：5000\n\n` +
      `📋 请复制以下模板，将占位符替换为真实信息后发送：\n\n` +
      `<code>${templateText}</code>\n\n` +
      `⚠️ 注意事项：\n` +
      `• 请确保所有信息准确无误\n` +
      `• 金额请填写具体数字，不要包含货币符号\n` +
      `• 模板中的{用户名}和{时间}已自动填充\n` +
      `• 👆 点击上方模板内容可快速选中复制\n\n` +
      `🔄 取消操作：发送 /cancel 或 取消\n` +
      `❓ 需要帮助：联系管理员`;

    await this.sendMessage(chatId, guidanceMessage);
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
        `🕰️ 审批时间：${formatDateTimeBeijing(new Date())}

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
      const submitTime = order.createdAt ? formatDateTimeBeijing(order.createdAt) : '未知';
      const processTime = formatDateTimeBeijing(new Date());
      
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
          
          // Remove the keyboard buttons after successfully editing the message
          const keyboardRemovalResult = await this.editMessageReplyMarkup(chatId, messageId, null);
          if (keyboardRemovalResult && keyboardRemovalResult.ok) {
            console.log(`[DEBUG] Successfully removed keyboard from bot order message ${messageId} for order ${order.id}`);
          } else {
            console.error(`[DEBUG] Failed to remove keyboard from bot order message ${messageId}:`, keyboardRemovalResult);
          }
          
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

    // Send keyboard and store message ID for later deletion
    const response = await this.sendMessage(
      chatId,
      '🔐 请输入4位管理员激活码：',
      this.getNumpadKeyboard('')
    );
    
    const keyboardMessageId = response?.result?.message_id;
    this.activationState.set(chatId, { 
      type: 'admin', 
      code: '',
      keyboardMessageId: keyboardMessageId
    });
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
    const display = currentCode.padEnd(4, '_').split('').join(' ');
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
      // Delete the keyboard message using stored message ID
      if (state.keyboardMessageId) {
        await this.deleteMessage(chatId, state.keyboardMessageId);
      }
      
      this.activationState.delete(chatId);
      await this.answerCallbackQuery(callbackQueryId, '已取消');
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
        
        // Delete the keyboard message before clearing state
        if (state.keyboardMessageId) {
          await this.deleteMessage(chatId, state.keyboardMessageId);
        }
        
        this.activationState.delete(chatId);
        await this.answerCallbackQuery(callbackQueryId, '激活成功！');
        await this.sendMessage(chatId, '✅ 群组已成功激活为管理群组！\n\n现在将接收所有待审批的报备订单。');
      } else {
        await this.answerCallbackQuery(callbackQueryId, '激活码错误');
        
        // Delete the keyboard message before clearing state
        if (state.keyboardMessageId) {
          await this.deleteMessage(chatId, state.keyboardMessageId);
        }
        
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
    
    // Use the stored keyboard messageId instead of 0
    if (state.keyboardMessageId) {
      await this.editMessageReplyMarkup(chatId, state.keyboardMessageId, this.getNumpadKeyboard(currentCode));
    }
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
        await this.editMessageReplyMarkup(chatId, 0, this.getAdminCodeKeyboard(state.code));
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
      // Delete the keyboard message using stored message ID with fallback
      if (state.keyboardMessageId) {
        await this.safeDeleteMessage(chatId, state.keyboardMessageId, 'admin code keyboard cancel');
      }
      
      this.activationState.delete(chatId);
      await this.answerCallbackQuery(callbackQueryId, '已取消');
      return;
    } else if (input === 'delete') {
      currentCode = currentCode.slice(0, -1);
    } else if (input === 'confirm') {
      if (currentCode.length !== 4) {
        await this.answerCallbackQuery(callbackQueryId, '请输入完整的4位管理员激活码');
        return;
      }
      
      // Verify activation code using fixed admin code from settings
      const systemCode = await storage.getSetting(ADMIN_ACTIVATION_KEY);
      const validCode = systemCode?.value || DEFAULT_ADMIN_CODE;
      
      if (currentCode !== validCode) {
        await this.answerCallbackQuery(callbackQueryId, '激活码无效');
        this.activationState.delete(chatId);
        await this.sendMessage(chatId, '❌ 激活码无效，请联系管理员获取正确的激活码。');
        return;
      }

      // Update user role to admin
      await storage.updateTelegramUser(state.user.id, {
        role: 'admin',
        isActive: true
      });

      await this.answerCallbackQuery(callbackQueryId, '管理员权限提升成功！');
      
      // Delete the admin code keyboard message before clearing state
      if (state.keyboardMessageId) {
        await this.deleteMessage(chatId, state.keyboardMessageId);
      }
      
      this.activationState.delete(chatId);
      
      await this.sendMessage(
        chatId,
        `✅ 管理员权限提升成功！\n\n欢迎 ${state.user.firstName}，您已成功获得管理员权限。\n\n请选择操作：`,
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

    // Limit to 4 characters
    if (currentCode.length > 4) {
      currentCode = currentCode.slice(0, 4);
    }

    state.code = currentCode;
    
    await this.answerCallbackQuery(callbackQueryId, '');
    await this.editMessageReplyMarkup(chatId, 0, this.getAdminCodeKeyboard(currentCode));
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


  // Admin button handler
  private async handleAdminButton(chatId: number, telegramUser: any) {
    if (telegramUser.role === 'admin') {
      // If user is already admin, show admin menu
      await this.showAdminFeatureMenu(chatId, telegramUser);
    } else {
      // If user is not admin, show admin code keypad
      const response = await this.sendMessage(
        chatId,
        '🔐 管理员权限提升\n\n请输入您的4位管理员激活码：',
        this.getAdminCodeKeyboard('')
      );
      
      const keyboardMessageId = response?.result?.message_id;
      const newState = { 
        type: 'admin_code' as const, 
        code: '', 
        user: telegramUser,
        keyboardMessageId: keyboardMessageId
      };
      this.activationState.set(chatId, newState);
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


  // Cancel command - Enhanced with better user feedback
  private async handleCancelCommand(chatId: number, telegramUser?: any) {
    // Check which states are active to provide specific feedback
    const hasReportState = this.reportState.has(chatId);
    const hasModifyState = this.modifyState.has(chatId);
    const hasActivationState = this.activationState.has(chatId);
    
    // Clear all possible states
    this.activationState.delete(chatId);
    this.reportState.delete(chatId);
    this.modifyState.delete(chatId);
    
    let message = '';
    
    if (hasReportState) {
      message = '✅ 已取消当前报备流程，返回主菜单';
    } else if (hasModifyState) {
      message = '✅ 已取消订单修改，返回主菜单';
    } else if (hasActivationState) {
      message = '✅ 已取消激活流程，返回主菜单';
    } else {
      message = 'ℹ️ 当前没有正在进行的操作';
    }
    
    // Get appropriate keyboard based on user role
    let replyKeyboard;
    if (telegramUser && telegramUser.role === 'admin') {
      replyKeyboard = await this.getAdminReplyKeyboard();
    } else if (telegramUser) {
      replyKeyboard = await this.getEmployeeReplyKeyboard();
    } else {
      replyKeyboard = { remove_keyboard: true };
    }
    
    await this.sendMessage(chatId, message, undefined, replyKeyboard);
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
✏️ 修改时间：${order.modificationTime ? formatDateTimeBeijing(order.modificationTime) : '未知'}

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
✏️ 修改时间：${formatDateTimeBeijing(new Date())}

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
        `✅ 订单修改成功！\n\n订单号：${modifiedOrder.orderNumber}\n✏️ 修改时间：${formatDateTimeBeijing(new Date())}\n📋 状态：已通过（含修改）\n\n订单已自动通过审批并通知员工。`,
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

      // User has submitted their filled template - validate content before creating order
      const typeNames = {
        deposit: '入款报备',
        withdrawal: '出款报备',
        refund: '退款报备'
      };

      try {
        // Use OrderParser service to extract customer, project, and amount information with order type
        const parseResult = OrderParser.parseOrderContent(text, state.type);
        
        // Validate content before creating order
        const validationResult = this.validateReportContent(text, parseResult);
        if (!validationResult.isValid) {
          // Send validation error message but keep reportState for resubmission
          await this.sendMessage(
            chatId,
            `❌ 提交内容不完整\n\n${validationResult.errorMessage}\n\n📝 请重新填写模板并提交：\n\n💡 提示：您可以发送 /cancel 取消当前操作。`
          );
          // Keep reportState intact so user can resubmit
          return;
        }
        
        // Use parsed amount or fallback to extracted amount for backward compatibility
        const displayAmount = parseResult.amountExtracted || OrderParser.extractAmount(text);

        // Validation passed - create order with parsed data
        const order = await storage.createOrder({
          type: state.type,
          telegramUserId: state.data.telegramUserId,
          amount: displayAmount,
          description: '', // Keep empty as all info is in originalContent
          status: 'pending',
          originalContent: text, // Store the complete submitted template content
          approvalMethod: 'web_dashboard', // Set as requested
          isModified: false, // Set as requested
          // Add parsed fields from OrderParser
          customerName: parseResult.customerName,
          projectName: parseResult.projectName,
          amountExtracted: parseResult.amountExtracted,
          extractionStatus: parseResult.extractionStatus
        });

        this.reportState.delete(chatId);

        // Enhanced confirmation message with detailed information and next steps
        let confirmationMessage = `🎉 ${typeNames[state.type]}提交成功！

📋 订单详情：
🆔 订单号：${order.orderNumber}
📊 类型：${typeNames[state.type]}
💰 金额：${displayAmount}`;

        // Add parsed information if available
        if (parseResult.customerName) {
          confirmationMessage += `\n👤 客户：${parseResult.customerName}`;
        }
        if (parseResult.projectName) {
          confirmationMessage += `\n🎯 项目：${parseResult.projectName}`;
        }
        
        confirmationMessage += `
        
📅 提交时间：${new Date().toLocaleString('zh-CN')}
⏳ 当前状态：等待管理员审批
⏰ 预计处理：工作时间内通常2-4小时内处理

🔔 审批通知：
• 审批结果将通过机器人消息通知您
• 您可以继续提交其他报备订单
• 如有紧急情况请联系管理员

📖 查看方式：
• 点击"📜 查看历史"查看所有订单状态
• 点击"🔴 待审批列表"（管理员功能）查看待处理订单

💡 温馨提示：
• 请保持信息准确性，避免频繁修改
• 如需修改订单信息，请联系管理员
• 感谢您的耐心等待！`;

        await this.sendMessage(
          chatId,
          confirmationMessage,
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
      `👥 总员工数：${stats.totalEmployees}\n` +
      `📊 总订单数：${stats.totalOrders}`;
    
    await this.sendMessage(chatId, message);
  }

  // Notify all admin groups
  // Store message IDs for each group to enable later editing
  private groupMessageIds = new Map<string, Map<string, number>>(); // orderId -> groupId -> messageId

  private async notifyAllAdminGroups(order: Order) {
    const adminGroups = await storage.getActiveAdminGroups();
    
    // Initialize storage for this order's group messages
    this.groupMessageIds.set(order.id, new Map());
    
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

    // Build message with complete employee-submitted content
    let message = `🔔 新的${typeNames[order.type]}\n\n` +
      `📝 订单号：${order.orderNumber}\n` +
      `👤 员工：${employeeName}\n` +
      `💵 金额：${order.amount}\n` +
      `📝 备注：${order.description || '无'}\n` +
      `⏰ 时间：${order.createdAt?.toLocaleString('zh-CN')}`;

    // Add the complete employee-submitted content for better approval decisions
    if (order.originalContent && order.originalContent.trim()) {
      message += `\n\n📋 员工提交的完整内容：\n`;
      message += `${'─'.repeat(30)}\n`;
      message += `${order.originalContent}\n`;
      message += `${'─'.repeat(30)}`;
    }

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
      
      // Save the message ID for this specific group
      if (response && response.ok && response.result && response.result.message_id) {
        const orderMessageIds = this.groupMessageIds.get(order.id) || new Map();
        orderMessageIds.set(groupId, response.result.message_id);
        this.groupMessageIds.set(order.id, orderMessageIds);
        console.log(`[DEBUG] Saved message ID ${response.result.message_id} for order ${order.id} in group ${groupId}`);
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
      `⏰ 审批时间：${order.approvedAt ? formatDateTimeBeijing(order.approvedAt) : formatDateTimeBeijing(new Date())}`;

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

  // Enhanced keyboard deletion with robustness and fallback mechanisms
  private async safeDeleteMessage(chatId: number, messageId: number | undefined, context: string) {
    if (!this.botToken) {
      console.log(`[DEBUG] Cannot delete message: missing bot token (${context})`);
      return;
    }

    if (!messageId) {
      console.log(`[DEBUG] Cannot delete message: missing messageId (${context})`);
      return;
    }

    try {
      console.log(`[DEBUG] Attempting to delete message ${messageId} in chat ${chatId} (${context})`);
      
      const response = await fetch(`${this.baseUrl}${this.botToken}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId
        })
      });

      const result = await response.json();
      if (result.ok) {
        console.log(`[DEBUG] Successfully deleted message ${messageId} (${context})`);
      } else {
        console.error(`[DEBUG] Failed to delete message ${messageId} (${context}):`, result.description);
      }
    } catch (error) {
      console.error(`[DEBUG] Error deleting message ${messageId} (${context}):`, error);
    }
  }

  // Update group chat message with order status
  async updateGroupChatMessage(order: Order, approverName: string): Promise<void> {
    if (!this.botToken) {
      console.log('[DEBUG] Cannot update group message: missing bot token');
      return;
    }

    // Get stored message IDs for this order
    const orderMessageIds = this.groupMessageIds.get(order.id);
    if (!orderMessageIds || orderMessageIds.size === 0) {
      console.log('[DEBUG] No group message IDs found for order:', order.id);
      return;
    }

    try {
      // Get active admin groups
      const adminGroups = await storage.getActiveAdminGroups();
      if (adminGroups.length === 0) {
        console.log('[DEBUG] No active admin groups found');
        return;
      }

      // Format status message
      const statusEmoji = order.status === 'approved' ? '✅' : order.status === 'rejected' ? '❌' : '🔄';
      const statusText = order.status === 'approved' ? '已确认' : order.status === 'rejected' ? '已拒绝' : order.status === 'approved_modified' ? '已修改确认' : '处理中';
      
      const timestamp = formatDateTimeBeijing(new Date());
      let message = `${statusEmoji} 订单 #${order.orderNumber} ${statusText} - 审批人：${approverName} - ${timestamp}`;
      
      // Add rejection reason if rejected
      if (order.status === 'rejected' && order.rejectionReason) {
        message += `\n\n🚫 拒绝原因：${order.rejectionReason}`;
      }

      // Add modification info if modified
      if (order.status === 'approved_modified' && order.modifiedContent) {
        message += `\n\n✏️ 修改内容：\n${order.modifiedContent}`;
      }

      // Update message in each admin group with correct message ID
      for (const group of adminGroups) {
        const messageId = orderMessageIds.get(group.groupId);
        if (!messageId) {
          console.log(`[DEBUG] No message ID found for group ${group.groupId}`);
          continue;
        }

        try {
          // First edit the message text
          const editResult = await this.editMessageText(
            parseInt(group.groupId),
            messageId,
            message
          );
          
          if (editResult && editResult.ok) {
            console.log(`[DEBUG] Successfully updated group message ${messageId} in group ${group.groupId}`);
            
            // Then remove the inline keyboard buttons
            await this.editMessageReplyMarkup(
              parseInt(group.groupId),
              messageId,
              null // Remove buttons
            );
            
          } else {
            console.error(`[DEBUG] Failed to update group message ${messageId} in group ${group.groupId}:`, editResult);
          }
        } catch (error) {
          console.error(`[DEBUG] Error updating group message in group ${group.groupId}:`, error);
        }
      }
      
      // Clean up stored message IDs after successful update
      this.groupMessageIds.delete(order.id);
      console.log(`[DEBUG] Cleaned up message IDs for order ${order.id}`);
      
    } catch (error) {
      console.error('[DEBUG] Error updating group chat message:', error);
    }
  }

  // Helper method to edit message reply markup (remove buttons)
  private async editMessageReplyMarkup(chatId: number, messageId: number, replyMarkup: any): Promise<any> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/editMessageReplyMarkup`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          reply_markup: replyMarkup
        })
      });
      
      const result = await response.json();
      console.log(`[DEBUG] Edit message reply markup result:`, result);
      return result;
    } catch (error) {
      console.error('Error editing message reply markup:', error);
      return null;
    }
  }

  // Get chat information from Telegram API
  async getChatInfo(chatId: string | number): Promise<TelegramChat | null> {
    if (!this.botToken) return null;

    try {
      const response = await fetch(`${this.baseUrl}${this.botToken}/getChat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId
        })
      });

      const data = await response.json();
      if (data.ok) {
        return data.result;
      } else {
        console.error('Error fetching chat info:', data.description);
        return null;
      }
    } catch (error) {
      console.error('Error fetching chat info:', error);
      return null;
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
      `📅 注册时间：${telegramUser.createdAt ? formatDateTimeBeijing(telegramUser.createdAt) : '未知'}`;
    
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
      .replace('{时间}', formatDateTimeBeijing(new Date()));

    // Set waiting state for template submission
    this.reportState.set(chatId, {
      type: reportType,
      step: 'waiting_template',
      data: { telegramUserId: telegramUser.id }
    });

    // Enhanced template message with detailed guidance
    const guidanceMessage = `📋 ${typeNames[reportType]}模板\n\n` +
      `📝 填写指南：\n` +
      `✅ 必填字段：客户姓名、项目名称、具体金额\n` +
      `📌 格式要求：使用中文冒号（：）分隔字段和内容\n\n` +
      `💡 正确格式示例：\n` +
      `客户：张三\n` +
      `项目：VIP充值服务\n` +
      `金额：5000\n\n` +
      `📋 请复制以下模板，将占位符替换为真实信息后发送：\n\n` +
      `<code>${templateText}</code>\n\n` +
      `⚠️ 注意事项：\n` +
      `• 请确保所有信息准确无误\n` +
      `• 金额请填写具体数字，不要包含货币符号\n` +
      `• 模板中的{用户名}和{时间}已自动填充\n` +
      `• 👆 点击上方模板内容可快速选中复制\n\n` +
      `🔄 取消操作：发送 /cancel 或 取消\n` +
      `❓ 需要帮助：联系管理员`;

    await this.sendMessage(chatId, guidanceMessage);
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
      const submitTime = order.createdAt ? formatDateTimeBeijing(order.createdAt) : '未知';
      
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
      `👥 总员工数：${stats.totalEmployees}\n` +
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
    
    // Get confirmer information
    let confirmedBy = 'Web端';
    if (order.approvedBy) {
      const approver = await storage.getTelegramUserById(order.approvedBy);
      if (approver) {
        confirmedBy = approver.firstName || approver.username || '管理员';
      }
    }
    
    const processTime = formatDateTimeBeijing(new Date());

    const message = `${statusEmojis[status as keyof typeof statusEmojis]} ${typeNames[order.type]}\n\n` +
      `📝 订单号：${order.orderNumber}\n` +
      `👤 员工：${employeeName}\n` +
      `💵 金额：${order.amount}\n` +
      `📝 备注：${order.description || '无'}\n` +
      `📅 提交时间：${order.createdAt ? formatDateTimeBeijing(order.createdAt) : '未知'}\n` +
      `✅ 处理时间：${processTime}\n` +
      `👨‍💼 确认人：${confirmedBy}`;

    try {
      // Try to edit the original message if we have the message ID
      if (order.groupMessageId) {
        const messageId = parseInt(order.groupMessageId);
        console.log(`[DEBUG] Attempting to edit message ${messageId} in chat ${chatId}`);
        
        const editResult = await this.editMessageText(chatId, messageId, message);
        
        if (editResult && editResult.ok) {
          console.log(`[DEBUG] Successfully edited message ${messageId} for order ${order.id}`);
          
          // Remove the keyboard buttons after successfully editing the message
          const keyboardRemovalResult = await this.editMessageReplyMarkup(chatId, messageId, null);
          if (keyboardRemovalResult && keyboardRemovalResult.ok) {
            console.log(`[DEBUG] Successfully removed keyboard from message ${messageId} for order ${order.id}`);
          } else {
            console.error(`[DEBUG] Failed to remove keyboard from message ${messageId}:`, keyboardRemovalResult);
          }
          
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
