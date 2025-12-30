import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

import connectDB from "./src/config/database.js";
import connectRedis from "./src/config/redis.js";
import { errorHandler, notFound } from "./src/middleware/errorHandler.js";
import { rateLimiter } from "./src/middleware/rateLimiter.js";
import logger from "./src/utils/logger.js";

// Import routes
import authRoutes from "./src/routes/auth.routes.js";
import tenantRoutes from "./src/routes/tenant.routes.js";
import projectRoutes from "./src/routes/project.routes.js";
import taskRoutes from "./src/routes/task.routes.js";
import userRoutes from "./src/routes/user.routes.js";
import auditRoutes from "./src/routes/audit.routes.js";
import dashboardRoutes from "./src/routes/dashboard.routes.js";
import reportRoutes from "./src/routes/report.routes.js";
import permissionRoutes from "./src/routes/permission.routes.js";

// Load environment variables
dotenv.config();

const app = express();

// Global database and redis connections (reuse across function calls)
let dbConnected = false;
let redisConnected = false;

const initializeConnections = async () => {
  try {
    if (!dbConnected) {
      await connectDB();
      dbConnected = true;
      logger.info("✅ MongoDB connected");
    }

    if (!redisConnected) {
      await connectRedis();
      redisConnected = true;
      logger.info("✅ Redis connected");
    }
  } catch (error) {
    logger.error("❌ Failed to initialize connections:", error);
    // Don't throw error - allow app to start without databases
    // This enables basic health checks and API responses even without DB
    logger.warn("⚠️ Continuing without database connections - limited functionality available");
  }
};

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-ID"],
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logging
if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan("combined", {
      stream: { write: (message) => logger.info(message.trim()) },
    })
  );
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: "vercel-serverless",
    databases: {
      mongodb: dbConnected ? "connected" : "disconnected",
      redis: redisConnected ? "connected" : "disconnected"
    },
    note: (!dbConnected || !redisConnected) ? "Limited functionality - databases not configured" : "Fully operational"
  });
});

// Initialize connections middleware (non-blocking)
app.use(async (req, res, next) => {
  try {
    await initializeConnections();
  } catch (error) {
    logger.error("Connection initialization failed:", error);
  }
  // Always continue, even if connections fail
  next();
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/permissions", permissionRoutes);

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

// Export for Vercel
export default app;
