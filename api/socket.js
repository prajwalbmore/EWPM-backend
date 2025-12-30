// Vercel API route for Socket.IO handling
// Note: This is a limited implementation due to serverless constraints

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import logger from '../src/utils/logger.js';

let io;

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Initialize Socket.IO server if not exists
  if (!io) {
    io = new Server(res.socket.server, {
      path: '/api/socket',
      cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    io.use(async (socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace("Bearer ", "");

        if (!token) {
          logger.warn(`Socket connection rejected: No token provided for socket ${socket.id}`);
          return next(new Error("Authentication error: No token provided"));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        socket.userRole = decoded.role;
        socket.tenantId = decoded.tenantId;
        socket.data = {
          userId: decoded.id,
          userRole: decoded.role,
          tenantId: decoded.tenantId,
        };

        logger.info(`Socket authenticated: ${socket.id} for user ${decoded.id}`);
        next();
      } catch (error) {
        logger.error(`Socket authentication failed for ${socket.id}:`, error.message);
        next(new Error("Authentication error"));
      }
    });

    io.on('connection', (socket) => {
      logger.info(`Socket connected: ${socket.id}`);

      socket.on('join-project', (projectId) => {
        socket.join(`project-${projectId}`);
        logger.info(`User ${socket.userId} joined project-${projectId}`);
      });

      socket.on('leave-project', (projectId) => {
        socket.leave(`project-${projectId}`);
        logger.info(`User ${socket.userId} left project-${projectId}`);
      });

      socket.on('task-update', (data) => {
        socket.to(`project-${data.projectId}`).emit('task-updated', data);
      });

      socket.on('disconnect', () => {
        logger.info(`Socket disconnected: ${socket.id}`);
      });
    });
  }

  res.end();
}
