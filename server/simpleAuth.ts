import type { Express, RequestHandler } from "express";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import pkg from "pg";
const { Pool } = pkg;

const PgSession = ConnectPgSimple(session);

// Hardcoded admin credentials for production use
const ADMIN_CREDENTIALS = {
  username: "admin",
  password: "admin123!@#" // You can change this to your preferred password
};

// Create connection pool for session storage
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const getSession = () => {
  return session({
    store: new PgSession({
      pool,
      tableName: "sessions",
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: "telegram_bot_session",
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  });
};

export async function setupSimpleAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Login endpoint
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
      (req.session as any).user = {
        id: 'admin',
        username: 'admin',
        role: 'admin',
        loginTime: new Date().toISOString()
      };
      res.json({ 
        success: true, 
        user: { 
          id: 'admin', 
          username: 'admin', 
          role: 'admin' 
        } 
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  });

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: 'Could not log out' });
      }
      res.json({ success: true });
    });
  });

  // Get current user endpoint
  app.get('/api/auth/user', (req, res) => {
    const user = (req.session as any)?.user;
    if (user) {
      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        email: 'admin@telegram-bot.local',
        firstName: 'Admin',
        lastName: 'User'
      });
    } else {
      res.status(401).json({ message: 'Unauthorized' });
    }
  });
}

// Simple authentication middleware
export const isAuthenticated: RequestHandler = (req, res, next) => {
  const user = (req.session as any)?.user;
  
  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  // Attach user to request for use in routes
  (req as any).user = {
    id: user.id,
    claims: { sub: user.id },
    username: user.username,
    role: user.role
  };
  
  next();
};