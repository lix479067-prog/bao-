import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupSimpleAuth, isAuthenticated } from "./simpleAuth";
import { setupTelegramBot } from "./services/telegramBot";
import { insertTelegramUserSchema, insertOrderSchema, insertBotConfigSchema, insertKeyboardButtonSchema, insertReportTemplateSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupSimpleAuth(app);

  // Auth routes are handled in setupSimpleAuth

  // Telegram webhook endpoint
  app.post('/api/telegram/webhook', async (req, res) => {
    try {
      await setupTelegramBot();
      const telegramBot = (global as any).telegramBot;
      if (telegramBot) {
        await telegramBot.handleWebhook(req.body);
      }
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

  app.patch('/api/orders/:id/status', isAuthenticated, async (req: any, res) => {
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
      }
      
      res.json(order);
    } catch (error) {
      console.error('Error updating order status:', error);
      res.status(500).json({ message: 'Failed to update order status' });
    }
  });

  // Telegram users management
  app.get('/api/telegram-users', isAuthenticated, async (req, res) => {
    try {
      const users = await storage.getAllTelegramUsers();
      res.json(users);
    } catch (error) {
      console.error('Error fetching telegram users:', error);
      res.status(500).json({ message: 'Failed to fetch telegram users' });
    }
  });

  app.post('/api/telegram-users', isAuthenticated, async (req, res) => {
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

  app.patch('/api/telegram-users/:id', isAuthenticated, async (req, res) => {
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

  // Bot configuration
  app.get('/api/bot-config', isAuthenticated, async (req, res) => {
    try {
      const config = await storage.getBotConfig();
      res.json(config);
    } catch (error) {
      console.error('Error fetching bot config:', error);
      res.status(500).json({ message: 'Failed to fetch bot config' });
    }
  });

  app.post('/api/bot-config', isAuthenticated, async (req, res) => {
    try {
      const configData = insertBotConfigSchema.parse(req.body);
      const config = await storage.upsertBotConfig(configData);
      
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
  app.post('/api/bot-config/test', isAuthenticated, async (req, res) => {
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
  app.get('/api/keyboard-buttons', isAuthenticated, async (req, res) => {
    try {
      const buttons = await storage.getAllKeyboardButtons();
      res.json(buttons);
    } catch (error) {
      console.error('Error fetching keyboard buttons:', error);
      res.status(500).json({ message: 'Failed to fetch keyboard buttons' });
    }
  });

  app.post('/api/keyboard-buttons', isAuthenticated, async (req, res) => {
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

  app.patch('/api/keyboard-buttons/:id', isAuthenticated, async (req, res) => {
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

  app.delete('/api/keyboard-buttons/:id', isAuthenticated, async (req, res) => {
    try {
      await storage.deleteKeyboardButton(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting keyboard button:', error);
      res.status(500).json({ message: 'Failed to delete keyboard button' });
    }
  });

  // Report templates
  app.get('/api/templates', isAuthenticated, async (req, res) => {
    try {
      const templates = await storage.getAllTemplates();
      res.json(templates);
    } catch (error) {
      console.error('Error fetching templates:', error);
      res.status(500).json({ message: 'Failed to fetch templates' });
    }
  });

  app.post('/api/templates', isAuthenticated, async (req, res) => {
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

  app.patch('/api/templates/:id', isAuthenticated, async (req, res) => {
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

  app.delete('/api/templates/:id', isAuthenticated, async (req, res) => {
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

  app.post('/api/settings', isAuthenticated, async (req, res) => {
    try {
      const { key, value } = req.body;
      const setting = await storage.setSetting(key, value);
      res.json(setting);
    } catch (error) {
      console.error('Error saving setting:', error);
      res.status(500).json({ message: 'Failed to save setting' });
    }
  });

  const httpServer = createServer(app);
  
  // Initialize Telegram bot on startup
  setupTelegramBot().catch(console.error);

  return httpServer;
}
