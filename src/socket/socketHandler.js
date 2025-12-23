import logger from '../utils/logger.js';

const socketHandler = (socket, io) => {
  logger.info(`Socket connected: ${socket.id}`);

  // Auto-join user room on connection if userId is available
  if (socket.userId || socket.data?.userId) {
    const userId = socket.userId || socket.data.userId;
    const userIdStr = userId.toString();
    const roomName = `user:${userIdStr}`;
    socket.join(roomName);
    logger.info(`✅ Socket ${socket.id} auto-joined user room: ${roomName} (from auth)`);
  }

  // Join user room for personal notifications (manual join)
  socket.on('join:user', (userId) => {
    // Ensure userId is a string
    const userIdStr = userId?.toString ? userId.toString() : String(userId);
    const roomName = `user:${userIdStr}`;
    socket.join(roomName);
    logger.info(`✅ Socket ${socket.id} joined user room: ${roomName}`);
    
    // Log all rooms this socket is in
    const rooms = Array.from(socket.rooms);
    logger.info(`Socket ${socket.id} is now in rooms: ${rooms.join(', ')}`);
  });

  // Handle force join event (from backend)
  socket.on('force:join:user', (userId) => {
    const userIdStr = userId.toString();
    const roomName = `user:${userIdStr}`;
    socket.join(roomName);
    logger.info(`✅ Socket ${socket.id} force-joined user room: ${roomName}`);
  });

  // Join tenant room for multi-tenant isolation
  socket.on('join:tenant', (tenantId) => {
    socket.join(`tenant:${tenantId}`);
    logger.info(`Socket ${socket.id} joined tenant: ${tenantId}`);
  });

  // Join project room for real-time project updates
  socket.on('join:project', (projectId) => {
    socket.join(`project:${projectId}`);
    logger.info(`Socket ${socket.id} joined project: ${projectId}`);
  });

  // Join task room for real-time task updates
  socket.on('join:task', (taskId) => {
    socket.join(`task:${taskId}`);
    logger.info(`Socket ${socket.id} joined task: ${taskId}`);
  });

  // Handle task status updates
  socket.on('task:status:update', (data) => {
    const { taskId, status, tenantId } = data;
    io.to(`task:${taskId}`).emit('task:status:changed', {
      taskId,
      status,
      timestamp: new Date()
    });
    logger.info(`Task ${taskId} status updated to ${status}`);
  });

  // Handle task comments
  socket.on('task:comment:add', (data) => {
    const { taskId, comment, tenantId } = data;
    io.to(`task:${taskId}`).emit('task:comment:added', {
      taskId,
      comment,
      timestamp: new Date()
    });
    logger.info(`Comment added to task ${taskId}`);
  });

  // Handle typing indicators
  socket.on('task:typing:start', (data) => {
    const { taskId, userId } = data;
    socket.to(`task:${taskId}`).emit('task:typing:started', {
      taskId,
      userId
    });
  });

  socket.on('task:typing:stop', (data) => {
    const { taskId, userId } = data;
    socket.to(`task:${taskId}`).emit('task:typing:stopped', {
      taskId,
      userId
    });
  });

  // Handle user presence
  socket.on('user:presence:update', (data) => {
    const { tenantId, status } = data; // status: 'online', 'away', 'offline'
    socket.to(`tenant:${tenantId}`).emit('user:presence:changed', {
      userId: socket.userId, // Should be set during authentication
      status,
      timestamp: new Date()
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });

  // Error handling
  socket.on('error', (error) => {
    logger.error(`Socket error for ${socket.id}:`, error);
  });
};

export default socketHandler;

