import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setTimezone, BEIJING_TIMEZONE } from "@shared/utils/timeUtils";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Fix ESM dirname for Node.js
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize timezone settings from storage with comprehensive error handling
  try {
    const { storage } = await import("./storage");
    // Test database connection first
    try {
      const timezoneSetting = await storage.getSetting('timezone');
      if (timezoneSetting?.value) {
        setTimezone(timezoneSetting.value);
        console.log('[Server] Timezone loaded from storage:', timezoneSetting.value);
      } else {
        setTimezone(BEIJING_TIMEZONE);
        console.log('[Server] No timezone setting found, using Beijing timezone');
      }
    } catch (dbError) {
      console.warn('[Server] Database connection failed during timezone initialization:', dbError);
      setTimezone(BEIJING_TIMEZONE);
      console.log('[Server] Using fallback Beijing timezone due to database issue');
    }
  } catch (storageError) {
    console.error('[Server] Failed to import storage module:', storageError);
    setTimezone(BEIJING_TIMEZONE);
    console.log('[Server] Using fallback Beijing timezone due to storage import failure');
  }
  
  // Register routes with error handling
  let server;
  try {
    server = await registerRoutes(app);
    console.log('[Server] Routes registered successfully');
  } catch (routeError) {
    console.error('[Server] Failed to register routes:', routeError);
    // Create a minimal server as fallback
    const http = await import('http');
    server = http.createServer(app);
    console.log('[Server] Using fallback HTTP server due to route registration failure');
  }

  // Enhanced global error handler with startup safety
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error('[Server] Global error handler caught:', {
      status,
      message,
      stack: err.stack
    });

    // Only send response if headers haven't been sent
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    
    // Don't throw in production to prevent server crashes
    if (process.env.NODE_ENV !== 'production') {
      throw err;
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    // Production static serving with fallback path handling
    try {
      // Check multiple possible static asset paths (safe from ESM dirname issues)
      const possiblePaths = [
        path.resolve(process.cwd(), "dist", "public"),       // Vite build to dist/public
        path.resolve(process.cwd(), "client", "dist"),        // Vite build to client/dist
        path.resolve(process.cwd(), "dist"),                  // Vite build to dist root
        path.resolve(__dirname, "public"),                    // Current directory fallback
        path.resolve(__dirname, "..", "dist", "public")       // Relative to server dir
      ];
      
      let staticPath = null;
      for (const checkPath of possiblePaths) {
        if (fs.existsSync(checkPath)) {
          // Also verify index.html exists in the static path
          const indexPath = path.join(checkPath, 'index.html');
          if (fs.existsSync(indexPath)) {
            staticPath = checkPath;
            console.log(`[Server] Found static assets with index.html at: ${staticPath}`);
            break;
          } else {
            console.warn(`[Server] Static directory exists but no index.html found at: ${checkPath}`);
          }
        }
      }
      
      if (staticPath) {
        // Serve static files directly with fallback to index.html
        app.use(express.static(staticPath));
        app.use("*", (_req, res) => {
          res.sendFile(path.resolve(staticPath!, "index.html"));
        });
        console.log(`[Server] Static assets served from: ${staticPath}`);
      } else {
        console.warn(`[Server] No valid static assets found at any of: ${possiblePaths.join(', ')}`);
        console.log(`[Server] Falling back to original serveStatic function`);
        serveStatic(app); // Fall back to original function
      }
    } catch (error) {
      console.error('[Server] Error setting up static serving:', error);
      // Fallback to original serveStatic which will show clear error message
      serveStatic(app);
    }
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
