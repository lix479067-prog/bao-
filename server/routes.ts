import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupSimpleAuth, isAuthenticated, isAdmin } from "./simpleAuth";
import { setupTelegramBot } from "./services/telegramBot";
import { OrderParser } from "./services/orderParser";
import { insertTelegramUserSchema, insertOrderSchema, insertBotConfigSchema, insertKeyboardButtonSchema, insertReportTemplateSchema, ADMIN_GROUP_ACTIVATION_KEY, ADMIN_ACTIVATION_KEY, DEFAULT_ADMIN_ACTIVATION_CODE, DEFAULT_ADMIN_CODE } from "@shared/schema";
import { z } from "zod";
import { randomInt } from "crypto";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupSimpleAuth(app);

  // Initialize default activation codes if not exists
  const existingGroupCode = await storage.getSetting(ADMIN_GROUP_ACTIVATION_KEY);
  if (!existingGroupCode) {
    // Generate a cryptographically secure random 4-digit activation code for group
    const randomCode = randomInt(1000, 10000).toString();
    await storage.setSetting(ADMIN_GROUP_ACTIVATION_KEY, randomCode);
    // Don't log sensitive activation codes
  }

  // Initialize default admin activation code if not exists
  const existingAdminCode = await storage.getSetting(ADMIN_ACTIVATION_KEY);
  if (!existingAdminCode) {
    await storage.setSetting(ADMIN_ACTIVATION_KEY, DEFAULT_ADMIN_CODE);
  }

  // Initialize Telegram bot once at startup
  await setupTelegramBot();

  // Auth routes are handled in setupSimpleAuth

  // Telegram webhook endpoint with secret token verification
  app.post('/api/telegram/webhook', async (req, res) => {
    console.log('[DEBUG] Webhook request received:', {
      headers_secret: !!req.headers['x-telegram-bot-api-secret-token'],
      body_update_id: req.body?.update_id,
      body_message_from: req.body?.message?.from?.id,
      body_callback_from: req.body?.callback_query?.from?.id,
      full_body: JSON.stringify(req.body),
      timestamp: new Date().toISOString()
    });
    
    try {
      // Get existing bot instance instead of reinitializing
      let telegramBot = (global as any).telegramBot;
      
      if (!telegramBot) {
        console.error('Bot not initialized - initializing now');
        await setupTelegramBot();
        telegramBot = (global as any).telegramBot;
        if (!telegramBot) {
          return res.status(500).json({ error: 'Bot not initialized' });
        }
      }
      
      // Verify webhook secret token
      const secretToken = req.headers['x-telegram-bot-api-secret-token'] as string;
      const expectedSecret = telegramBot.getWebhookSecret();
      
      if (!secretToken || secretToken !== expectedSecret) {
        console.warn('[DEBUG] Invalid webhook secret token:', { 
          received: !!secretToken, 
          expected_length: expectedSecret?.length || 0,
          match: secretToken === expectedSecret 
        });
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      await telegramBot.handleWebhook(req.body);
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Dashboard stats
  app.get('/api/dashboard/stats', isAuthenticated, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({ message: 'Failed to fetch dashboard stats' });
    }
  });

  // Recent orders for dashboard
  app.get('/api/dashboard/recent-orders', isAuthenticated, async (req, res) => {
    try {
      const { orders } = await storage.getOrdersWithUsers({ limit: 5 });
      res.json(orders);
    } catch (error) {
      console.error('Error fetching recent orders:', error);
      res.status(500).json({ message: 'Failed to fetch recent orders' });
    }
  });

  // Orders management
  app.get('/api/orders', isAuthenticated, async (req, res) => {
    try {
      const { status, type, search, page = '1', limit = '10' } = req.query;
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      
      const result = await storage.getOrdersWithUsers({
        status: status as string,
        type: type as string,
        search: search as string,
        limit: parseInt(limit as string),
        offset
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({ message: 'Failed to fetch orders' });
    }
  });

  app.get('/api/orders/:id', isAuthenticated, async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      res.json(order);
    } catch (error) {
      console.error('Error fetching order:', error);
      res.status(500).json({ message: 'Failed to fetch order' });
    }
  });

  app.patch('/api/orders/:id/status', isAdmin, async (req: any, res) => {
    try {
      const { status, rejectionReason } = req.body;
      const adminId = req.user.claims.sub;
      
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }

      const order = await storage.updateOrderStatus(
        req.params.id,
        status,
        adminId,
        rejectionReason
      );
      
      // Notify user via Telegram
      const telegramBot = (global as any).telegramBot;
      if (telegramBot) {
        await telegramBot.notifyOrderStatus(order);
        
        // Update group chat message with new status
        const adminUser = await storage.getUser(adminId);
        const approverName = adminUser ? `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() || adminUser.email || 'Web管理员' : 'Web管理员';
        await telegramBot.updateGroupChatMessage(order, approverName);
      }
      
      res.json(order);
    } catch (error) {
      console.error('Error updating order status:', error);
      res.status(500).json({ message: 'Failed to update order status' });
    }
  });

  // Modify order and approve
  app.patch('/api/orders/:id/modify', isAdmin, async (req: any, res) => {
    try {
      const { modifiedContent } = req.body;
      const adminId = req.user.claims.sub;
      
      // Validate input
      if (!modifiedContent || typeof modifiedContent !== 'string' || !modifiedContent.trim()) {
        return res.status(400).json({ message: 'Modified content is required' });
      }

      // Get the order to verify it exists and can be modified
      const existingOrder = await storage.getOrder(req.params.id);
      if (!existingOrder) {
        return res.status(404).json({ message: 'Order not found' });
      }

      if (existingOrder.status !== 'pending') {
        return res.status(400).json({ message: 'Only pending orders can be modified' });
      }

      // Update order with modification
      const order = await storage.updateModifiedOrder(
        req.params.id,
        modifiedContent.trim(),
        adminId,
        'web_dashboard'
      );
      
      // Notify user via Telegram
      const telegramBot = (global as any).telegramBot;
      if (telegramBot) {
        // Get the updated order with user data
        const updatedOrderData = { ...order };
        
        // Notify employee about the modification
        const employee = await storage.getTelegramUserById(order.telegramUserId);
        if (employee) {
          await telegramBot.notifyEmployeeOfModification(
            employee, 
            updatedOrderData, 
            modifiedContent.trim(), 
            existingOrder.originalContent || existingOrder.description || ''
          );
        }

        // For admin groups notification, we'll create a minimal admin object
        // since web dashboard admins may not have corresponding Telegram accounts
        const webAdminUser = {
          id: adminId,
          firstName: 'Web管理员',
          username: 'web_admin'
        };

        await telegramBot.notifyAdminGroupsOfModification(
          updatedOrderData, 
          webAdminUser, 
          existingOrder.originalContent || existingOrder.description || '',
          modifiedContent.trim()
        );
        
        // Update group chat message with modification status
        const adminUser = await storage.getUser(adminId);
        const approverName = adminUser ? `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() || adminUser.email || 'Web管理员' : 'Web管理员';
        await telegramBot.updateGroupChatMessage(order, approverName);
      }
      
      res.json(order);
    } catch (error) {
      console.error('Error modifying order:', error);
      res.status(500).json({ message: 'Failed to modify order' });
    }
  });

  // Telegram users management
  app.get('/api/telegram-users', isAdmin, async (req, res) => {
    try {
      const users = await storage.getAllTelegramUsers();
      res.json(users);
    } catch (error) {
      console.error('Error fetching telegram users:', error);
      res.status(500).json({ message: 'Failed to fetch telegram users' });
    }
  });

  app.post('/api/telegram-users', isAdmin, async (req, res) => {
    try {
      const userData = insertTelegramUserSchema.parse(req.body);
      const user = await storage.createTelegramUser(userData);
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid user data', errors: error.errors });
      }
      console.error('Error creating telegram user:', error);
      res.status(500).json({ message: 'Failed to create telegram user' });
    }
  });

  app.patch('/api/telegram-users/:id', isAdmin, async (req, res) => {
    try {
      const userData = insertTelegramUserSchema.partial().parse(req.body);
      const user = await storage.updateTelegramUser(req.params.id, userData);
      res.json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid user data', errors: error.errors });
      }
      console.error('Error updating telegram user:', error);
      res.status(500).json({ message: 'Failed to update telegram user' });
    }
  });

  // Bot configuration with masked token
  app.get('/api/bot-config', isAdmin, async (req, res) => {
    try {
      const config = await storage.getBotConfig();
      if (config && config.botToken) {
        // Mask the bot token for security
        const token = config.botToken;
        const maskedToken = token.length > 10 
          ? `${token.substring(0, 6)}${'*'.repeat(token.length - 10)}${token.substring(token.length - 4)}`
          : '*'.repeat(token.length);
        
        res.json({
          ...config,
          botToken: maskedToken,
          botTokenMasked: true // Flag to indicate the token is masked
        });
      } else {
        res.json(config);
      }
    } catch (error) {
      console.error('Error fetching bot config:', error);
      res.status(500).json({ message: 'Failed to fetch bot config' });
    }
  });

  app.post('/api/bot-config', isAdmin, async (req, res) => {
    try {
      // Get existing config to preserve fields that aren't provided
      let configData = req.body;
      const existingConfig = await storage.getBotConfig();
      
      // If bot token is not provided, use existing one
      if (!configData.botToken && existingConfig) {
        configData.botToken = existingConfig.botToken;
      }
      
      // If adminGroupId is not provided, use existing one or default
      if (!configData.adminGroupId) {
        if (existingConfig && existingConfig.adminGroupId) {
          configData.adminGroupId = existingConfig.adminGroupId;
        } else {
          // Provide a default value for adminGroupId if none exists
          configData.adminGroupId = '';
        }
      }
      
      const validatedConfig = insertBotConfigSchema.parse(configData);
      const config = await storage.upsertBotConfig(validatedConfig);
      
      // Reinitialize bot with new config
      await setupTelegramBot();
      
      res.json(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid config data', errors: error.errors });
      }
      console.error('Error saving bot config:', error);
      res.status(500).json({ message: 'Failed to save bot config' });
    }
  });

  // Test bot connection
  app.post('/api/bot-config/test', isAdmin, async (req, res) => {
    try {
      const telegramBot = (global as any).telegramBot;
      if (!telegramBot) {
        return res.status(400).json({ message: 'Bot not configured' });
      }
      
      const isConnected = await telegramBot.testConnection();
      res.json({ connected: isConnected });
    } catch (error) {
      console.error('Error testing bot connection:', error);
      res.status(500).json({ message: 'Failed to test bot connection' });
    }
  });

  // Keyboard buttons
  app.get('/api/keyboard-buttons', isAdmin, async (req, res) => {
    try {
      const buttons = await storage.getAllKeyboardButtons();
      res.json(buttons);
    } catch (error) {
      console.error('Error fetching keyboard buttons:', error);
      res.status(500).json({ message: 'Failed to fetch keyboard buttons' });
    }
  });

  app.post('/api/keyboard-buttons', isAdmin, async (req, res) => {
    try {
      const buttonData = insertKeyboardButtonSchema.parse(req.body);
      const button = await storage.createKeyboardButton(buttonData);
      res.status(201).json(button);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid button data', errors: error.errors });
      }
      console.error('Error creating keyboard button:', error);
      res.status(500).json({ message: 'Failed to create keyboard button' });
    }
  });

  app.patch('/api/keyboard-buttons/:id', isAdmin, async (req, res) => {
    try {
      const buttonData = insertKeyboardButtonSchema.partial().parse(req.body);
      const button = await storage.updateKeyboardButton(req.params.id, buttonData);
      res.json(button);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid button data', errors: error.errors });
      }
      console.error('Error updating keyboard button:', error);
      res.status(500).json({ message: 'Failed to update keyboard button' });
    }
  });

  app.delete('/api/keyboard-buttons/:id', isAdmin, async (req, res) => {
    try {
      await storage.deleteKeyboardButton(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting keyboard button:', error);
      res.status(500).json({ message: 'Failed to delete keyboard button' });
    }
  });

  // Report templates
  app.get('/api/templates', isAdmin, async (req, res) => {
    try {
      const templates = await storage.getAllTemplates();
      res.json(templates);
    } catch (error) {
      console.error('Error fetching templates:', error);
      res.status(500).json({ message: 'Failed to fetch templates' });
    }
  });

  app.post('/api/templates', isAdmin, async (req, res) => {
    try {
      const templateData = insertReportTemplateSchema.parse(req.body);
      const template = await storage.createTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid template data', errors: error.errors });
      }
      console.error('Error creating template:', error);
      res.status(500).json({ message: 'Failed to create template' });
    }
  });

  app.patch('/api/templates/:id', isAdmin, async (req, res) => {
    try {
      const templateData = insertReportTemplateSchema.partial().parse(req.body);
      const template = await storage.updateTemplate(req.params.id, templateData);
      res.json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid template data', errors: error.errors });
      }
      console.error('Error updating template:', error);
      res.status(500).json({ message: 'Failed to update template' });
    }
  });

  app.delete('/api/templates/:id', isAdmin, async (req, res) => {
    try {
      await storage.deleteTemplate(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting template:', error);
      res.status(500).json({ message: 'Failed to delete template' });
    }
  });

  // System settings
  app.get('/api/settings', isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getAllSettings();
      res.json(settings);
    } catch (error) {
      console.error('Error fetching settings:', error);
      res.status(500).json({ message: 'Failed to fetch settings' });
    }
  });

  app.post('/api/settings', isAdmin, async (req, res) => {
    try {
      const { key, value } = req.body;
      const setting = await storage.setSetting(key, value);
      res.json(setting);
    } catch (error) {
      console.error('Error saving setting:', error);
      res.status(500).json({ message: 'Failed to save setting' });
    }
  });
  
  
  // Admin group activation code
  app.get('/api/admin-activation-code', isAdmin, async (req, res) => {
    try {
      const setting = await storage.getSetting(ADMIN_GROUP_ACTIVATION_KEY);
      const code = setting?.value || DEFAULT_ADMIN_ACTIVATION_CODE;
      res.json({ code });
    } catch (error) {
      console.error('Error fetching activation code:', error);
      res.status(500).json({ message: 'Failed to fetch activation code' });
    }
  });
  
  app.post('/api/admin-activation-code', isAdmin, async (req, res) => {
    try {
      const { code } = req.body;
      if (!code || code.length !== 4 || !/^\d{4}$/.test(code)) {
        return res.status(400).json({ message: 'Activation code must be 4 digits' });
      }
      
      await storage.setSetting(ADMIN_GROUP_ACTIVATION_KEY, code);
      res.json({ success: true, code });
    } catch (error) {
      console.error('Error updating activation code:', error);
      res.status(500).json({ message: 'Failed to update activation code' });
    }
  });
  
  // Admin groups management
  app.get('/api/admin-groups', isAdmin, async (req, res) => {
    try {
      const groups = await storage.getActiveAdminGroups();
      res.json(groups);
    } catch (error) {
      console.error('Error fetching admin groups:', error);
      res.status(500).json({ message: 'Failed to fetch admin groups' });
    }
  });

  // Batch order processing endpoint
  app.post('/api/admin/reprocess-orders', isAdmin, async (req, res) => {
    try {
      const { batchSize = 50, limit } = req.body;
      
      // Validate input
      const validBatchSize = Math.min(Math.max(parseInt(batchSize) || 50, 1), 100);
      const maxLimit = limit ? Math.max(parseInt(limit), 1) : undefined;
      
      console.log('[BatchProcessor] Starting order reprocessing:', {
        batchSize: validBatchSize,
        limit: maxLimit,
        timestamp: new Date().toISOString()
      });

      // Get initial stats
      const initialStats = await storage.getReprocessingStats();
      console.log('[BatchProcessor] Initial stats:', initialStats);

      if (initialStats.pendingOrders === 0) {
        return res.json({
          success: true,
          message: 'No orders need reprocessing',
          stats: initialStats,
          processed: 0,
          updated: 0,
          errors: []
        });
      }

      let totalProcessed = 0;
      let totalUpdated = 0;
      let errors: string[] = [];
      let offset = 0;
      const processLimit = maxLimit || initialStats.pendingOrders;

      while (totalProcessed < processLimit) {
        const remainingToProcess = processLimit - totalProcessed;
        const currentBatchSize = Math.min(validBatchSize, remainingToProcess);
        
        // Get orders for processing
        const { orders: ordersToProcess } = await storage.getOrdersForReprocessing({
          limit: currentBatchSize,
          offset: 0 // Always start from 0 since processed orders are updated
        });

        if (ordersToProcess.length === 0) {
          console.log('[BatchProcessor] No more orders to process');
          break;
        }

        console.log(`[BatchProcessor] Processing batch of ${ordersToProcess.length} orders`);

        // Process each order in the batch
        const updates: Array<{
          id: string;
          customerName: string | null;
          projectName: string | null;
          amountExtracted: string | null;
          extractionStatus: "success" | "failed";
        }> = [];

        for (const order of ordersToProcess) {
          try {
            if (!order.originalContent) {
              console.warn(`[BatchProcessor] Order ${order.id} has no originalContent`);
              updates.push({
                id: order.id,
                customerName: null,
                projectName: null,
                amountExtracted: null,
                extractionStatus: 'failed'
              });
              continue;
            }

            // Use OrderParser to extract data with order type for precise matching
            const parseResult = OrderParser.parseOrderContent(order.originalContent, order.type);
            
            // Validate the result
            const isValid = OrderParser.validateParseResult(parseResult);
            if (!isValid) {
              console.warn(`[BatchProcessor] Invalid parse result for order ${order.id}`);
              updates.push({
                id: order.id,
                customerName: null,
                projectName: null,
                amountExtracted: null,
                extractionStatus: 'failed'
              });
              continue;
            }

            updates.push({
              id: order.id,
              customerName: parseResult.customerName,
              projectName: parseResult.projectName,
              amountExtracted: parseResult.amountExtracted,
              extractionStatus: parseResult.extractionStatus === 'failed' ? 'failed' : 'success'
            });

          } catch (error) {
            console.error(`[BatchProcessor] Error processing order ${order.id}:`, error);
            errors.push(`Order ${order.orderNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            updates.push({
              id: order.id,
              customerName: null,
              projectName: null,
              amountExtracted: null,
              extractionStatus: 'failed'
            });
          }
        }

        // Batch update the database
        try {
          const updatedCount = await storage.batchUpdateOrderExtractionData(updates);
          totalUpdated += updatedCount;
          console.log(`[BatchProcessor] Updated ${updatedCount} orders in database`);
        } catch (error) {
          console.error('[BatchProcessor] Batch update error:', error);
          errors.push(`Batch update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        totalProcessed += ordersToProcess.length;
        
        // Add a small delay to prevent overwhelming the database
        if (totalProcessed < processLimit) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Get final stats
      const finalStats = await storage.getReprocessingStats();
      
      console.log('[BatchProcessor] Processing completed:', {
        totalProcessed,
        totalUpdated,
        errorsCount: errors.length,
        initialPending: initialStats.pendingOrders,
        finalPending: finalStats.pendingOrders
      });

      res.json({
        success: true,
        message: `Processed ${totalProcessed} orders, updated ${totalUpdated} records`,
        stats: finalStats,
        processed: totalProcessed,
        updated: totalUpdated,
        errors: errors.slice(0, 10) // Limit error messages to prevent large responses
      });

    } catch (error) {
      console.error('[BatchProcessor] Fatal error:', error);
      res.status(500).json({ 
        success: false,
        message: 'Batch processing failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get reprocessing statistics
  app.get('/api/admin/reprocess-stats', isAdmin, async (req, res) => {
    try {
      const stats = await storage.getReprocessingStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching reprocessing stats:', error);
      res.status(500).json({ message: 'Failed to fetch reprocessing stats' });
    }
  });

  // Customer Analysis API
  app.get('/api/customers/search', isAdmin, async (req, res) => {
    try {
      const { name, page = '1', limit = '50' } = req.query;
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      
      const result = await storage.searchCustomers(name as string, {
        limit: parseInt(limit as string),
        offset
      });
      
      res.json({
        ...result,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });
    } catch (error) {
      console.error('Error searching customers:', error);
      res.status(500).json({ message: 'Failed to search customers' });
    }
  });

  app.get('/api/customers/:name/orders', isAdmin, async (req, res) => {
    try {
      const customerName = decodeURIComponent(req.params.name);
      const { type, status, from, to, page = '1', limit = '10' } = req.query;
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      
      const result = await storage.getCustomerOrders(customerName, {
        type: type as string,
        status: status as string,
        from: from as string,
        to: to as string,
        limit: parseInt(limit as string),
        offset
      });
      
      res.json({
        ...result,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });
    } catch (error) {
      console.error('Error fetching customer orders:', error);
      res.status(500).json({ message: 'Failed to fetch customer orders' });
    }
  });

  app.get('/api/customers/:name/stats', isAdmin, async (req, res) => {
    try {
      const customerName = decodeURIComponent(req.params.name);
      const { type, status, from, to } = req.query;
      
      const stats = await storage.getCustomerStats(customerName, {
        type: type as string,
        status: status as string,
        from: from as string,
        to: to as string
      });
      
      res.json(stats);
    } catch (error) {
      console.error('Error fetching customer stats:', error);
      res.status(500).json({ message: 'Failed to fetch customer stats' });
    }
  });

  // Project Analysis API
  app.get('/api/projects/search', isAdmin, async (req, res) => {
    try {
      const { name, page = '1', limit = '50' } = req.query;
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      
      const result = await storage.searchProjects(name as string, {
        limit: parseInt(limit as string),
        offset
      });
      
      res.json({
        ...result,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });
    } catch (error) {
      console.error('Error searching projects:', error);
      res.status(500).json({ message: 'Failed to search projects' });
    }
  });

  app.get('/api/projects/:name/orders', isAdmin, async (req, res) => {
    try {
      const projectName = decodeURIComponent(req.params.name);
      const { type, status, from, to, page = '1', limit = '10' } = req.query;
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      
      const result = await storage.getProjectOrders(projectName, {
        type: type as string,
        status: status as string,
        from: from as string,
        to: to as string,
        limit: parseInt(limit as string),
        offset
      });
      
      res.json({
        ...result,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });
    } catch (error) {
      console.error('Error fetching project orders:', error);
      res.status(500).json({ message: 'Failed to fetch project orders' });
    }
  });

  app.get('/api/projects/:name/stats', isAdmin, async (req, res) => {
    try {
      const projectName = decodeURIComponent(req.params.name);
      const { type, status, from, to } = req.query;
      
      const stats = await storage.getProjectStats(projectName, {
        type: type as string,
        status: status as string,
        from: from as string,
        to: to as string
      });
      
      res.json(stats);
    } catch (error) {
      console.error('Error fetching project stats:', error);
      res.status(500).json({ message: 'Failed to fetch project stats' });
    }
  });

  // Type Analysis API
  app.get('/api/types/search', isAdmin, async (req, res) => {
    try {
      const { from, to, status, employee } = req.query;
      
      const result = await storage.getOrderTypes({
        from: from as string,
        to: to as string,
        status: status as string,
        employee: employee as string
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching order types:', error);
      res.status(500).json({ message: 'Failed to fetch order types' });
    }
  });

  app.get('/api/types/:type/orders', isAdmin, async (req, res) => {
    try {
      const orderType = req.params.type;
      const { status, from, to, employee, page = '1', limit = '10' } = req.query;
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      
      // Validate order type
      const validTypes = ['deposit', 'withdrawal', 'refund'];
      if (!validTypes.includes(orderType)) {
        return res.status(400).json({ message: 'Invalid order type' });
      }
      
      const result = await storage.getOrdersByType(orderType, {
        status: status as string,
        from: from as string,
        to: to as string,
        employee: employee as string,
        limit: parseInt(limit as string),
        offset
      });
      
      res.json({
        ...result,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });
    } catch (error) {
      console.error('Error fetching orders by type:', error);
      res.status(500).json({ message: 'Failed to fetch orders by type' });
    }
  });

  app.get('/api/types/:type/stats', isAdmin, async (req, res) => {
    try {
      const orderType = req.params.type;
      const { status, from, to, employee } = req.query;
      
      // Validate order type
      const validTypes = ['deposit', 'withdrawal', 'refund'];
      if (!validTypes.includes(orderType)) {
        return res.status(400).json({ message: 'Invalid order type' });
      }
      
      const stats = await storage.getTypeStats(orderType, {
        status: status as string,
        from: from as string,
        to: to as string,
        employee: employee as string
      });
      
      res.json(stats);
    } catch (error) {
      console.error('Error fetching type stats:', error);
      res.status(500).json({ message: 'Failed to fetch type stats' });
    }
  });

  app.get('/api/types/:type/customers', isAdmin, async (req, res) => {
    try {
      const orderType = req.params.type;
      const { status, from, to, employee, page = '1', limit = '50' } = req.query;
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      
      // Validate order type
      const validTypes = ['deposit', 'withdrawal', 'refund'];
      if (!validTypes.includes(orderType)) {
        return res.status(400).json({ message: 'Invalid order type' });
      }
      
      const result = await storage.getTypeCustomers(orderType, {
        status: status as string,
        from: from as string,
        to: to as string,
        employee: employee as string,
        limit: parseInt(limit as string),
        offset
      });
      
      res.json({
        ...result,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });
    } catch (error) {
      console.error('Error fetching type customers:', error);
      res.status(500).json({ message: 'Failed to fetch type customers' });
    }
  });

  app.get('/api/types/:type/projects', isAdmin, async (req, res) => {
    try {
      const orderType = req.params.type;
      const { status, from, to, employee, page = '1', limit = '50' } = req.query;
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      
      // Validate order type
      const validTypes = ['deposit', 'withdrawal', 'refund'];
      if (!validTypes.includes(orderType)) {
        return res.status(400).json({ message: 'Invalid order type' });
      }
      
      const result = await storage.getTypeProjects(orderType, {
        status: status as string,
        from: from as string,
        to: to as string,
        employee: employee as string,
        limit: parseInt(limit as string),
        offset
      });
      
      res.json({
        ...result,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });
    } catch (error) {
      console.error('Error fetching type projects:', error);
      res.status(500).json({ message: 'Failed to fetch type projects' });
    }
  });

  const httpServer = createServer(app);
  
  // Initialize Telegram bot on startup
  setupTelegramBot().catch(console.error);

  return httpServer;
}
