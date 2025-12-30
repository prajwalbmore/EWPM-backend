import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-ID"],
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "EWPM Backend is running on Vercel!",
    timestamp: new Date().toISOString(),
    environment: "vercel-serverless-test",
    note: "This is a test version without database connections"
  });
});

// Test API endpoint
app.get("/api/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is working!",
    data: {
      version: "1.0.0",
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString()
    }
  });
});

// Catch all handler for undefined routes
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: "The requested endpoint does not exist",
    path: req.originalUrl,
    method: req.method
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "production" ? "Something went wrong" : err.message
  });
});

// Export for Vercel
export default app;
