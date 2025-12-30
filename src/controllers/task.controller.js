import Task from '../models/Task.model.js';
import Project from '../models/Project.model.js';
import User from '../models/User.model.js';
import { createAuditLog } from '../services/audit.service.js';
import { getIO } from '../utils/socket.js';
import logger from '../utils/logger.js';

export const getTasks = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, projectId, status, assigneeId, type } = req.query;
    const query = { tenantId: req.tenantId };

    // EMPLOYEE can only see tasks assigned to them
    if (req.user && req.user.role === 'EMPLOYEE') {
      query.assigneeId = req.user.id;
    }
    // PROJECT_MANAGER can only see tasks in their projects
    else if (req.user && req.user.role === 'PROJECT_MANAGER') {
      // Get projects managed by this PROJECT_MANAGER
      const managedProjects = await Project.find({
        tenantId: req.tenantId,
        $or: [
          { managerId: req.user.id },
          { ownerId: req.user.id },
          { 'members.userId': req.user.id }
        ]
      }).select('_id');
      
      const projectIds = managedProjects.map(p => p._id);
      if (projectIds.length > 0) {
        query.projectId = { $in: projectIds };
      } else {
        // No projects managed, return empty
        query.projectId = { $in: [] };
      }
    }

    if (projectId) query.projectId = projectId;
    if (status) query.status = status;
    if (assigneeId) query.assigneeId = assigneeId;
    if (type) query.type = type;

    const tasks = await Task.find(query)
      .populate('assigneeId', 'firstName lastName email')
      .populate('reporterId', 'firstName lastName email')
      .populate('projectId', 'name')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Task.countDocuments(query);

    res.json({
      success: true,
      data: tasks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get tasks error:', error);
    next(error);
  }
};

export const getTaskById = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    })
      .populate('assigneeId', 'firstName lastName email')
      .populate('reporterId', 'firstName lastName email')
      .populate('projectId', 'name')
      .populate('parentTaskId', 'title')
      .populate('dependencies.taskId', 'title status');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    logger.error('Get task by ID error:', error);
    next(error);
  }
};

export const createTask = async (req, res, next) => {
  try {
    // Verify project exists and belongs to tenant
    const project = await Project.findOne({
      _id: req.body.projectId,
      tenantId: req.tenantId
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // PROJECT_MANAGER can only create tasks in projects they manage
    if (req.user && req.user.role === 'PROJECT_MANAGER') {
      const isManager = project.managerId?.toString() === req.user.id || 
                       project.ownerId?.toString() === req.user.id;
      const isLeadMember = project.members?.some(
        m => m.userId?.toString() === req.user.id && m.role === 'LEAD'
      );

      if (!isManager && !isLeadMember) {
        return res.status(403).json({
          success: false,
          message: 'You can only create tasks in projects you manage'
        });
      }
    }

    const taskData = {
      ...req.body,
      tenantId: req.tenantId,
      reporterId: req.user.id
    };

    const task = await Task.create(taskData);

    // Populate task for notification
    await task.populate('projectId', 'name');
    await task.populate('assigneeId', 'firstName lastName email');

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user.id,
      action: 'CREATE',
      resourceType: 'TASK',
      resourceId: task._id,
      changes: { after: task.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    // Emit notification if task was created with an assignee
    if (task.assigneeId) {
      try {
        const io = getIO();
        const assignee = await User.findById(task.assigneeId);
        
        if (assignee) {
          const assigneeId = assignee._id.toString();
          logger.info(`Sending task assignment notification to: ${assigneeId}`);
          
          io.to(`user:${assigneeId}`).emit('notification', {
            type: 'TASK_ASSIGNED',
            title: 'New Task Assigned',
            message: `You have been assigned to task "${task.title}" in project "${task.projectId?.name || 'Unknown'}"`,
            taskId: task._id.toString(),
            projectId: task.projectId?._id?.toString() || task.projectId?.toString(),
            projectName: task.projectId?.name,
            assignedBy: {
              id: req.user.id.toString(),
              name: `${req.user.firstName} ${req.user.lastName}`
            },
            timestamp: new Date()
          });
        }
      } catch (error) {
        logger.error('Error sending task assignment notification:', error);
      }
    }

    res.status(201).json({
      success: true,
      data: task
    });
  } catch (error) {
    logger.error('Create task error:', error);
    next(error);
  }
};

export const updateTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // EMPLOYEE can only update tasks assigned to them
    if (req.user && req.user.role === 'EMPLOYEE') {
      if (task.assigneeId?.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only update tasks assigned to you'
        });
      }
      // EMPLOYEE cannot change assignee
      if (req.body.assigneeId && req.body.assigneeId !== task.assigneeId?.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You cannot reassign tasks'
        });
      }
    }
    // PROJECT_MANAGER can only update tasks in their projects
    else if (req.user && req.user.role === 'PROJECT_MANAGER') {
      const project = await Project.findById(task.projectId);
      if (project) {
        const isManager = project.managerId?.toString() === req.user.id || 
                         project.ownerId?.toString() === req.user.id;
        const isLeadMember = project.members?.some(
          m => m.userId?.toString() === req.user.id && m.role === 'LEAD'
        );

        if (!isManager && !isLeadMember) {
          return res.status(403).json({
            success: false,
            message: 'You can only update tasks in projects you manage'
          });
        }
      }
    }

    const before = task.toObject();
    const oldAssigneeId = task.assigneeId?.toString();
    Object.assign(task, req.body);
    await task.save();

    // Populate task for notification
    await task.populate('projectId', 'name');
    await task.populate('assigneeId', 'firstName lastName email');

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'TASK',
      resourceId: task._id,
      changes: { before, after: task.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    // Emit notification if task was assigned to a new user
    if (req.body.assigneeId && req.body.assigneeId !== oldAssigneeId && task.assigneeId) {
      try {
        const io = getIO();
        const assignee = await User.findById(req.body.assigneeId);
        
        if (assignee) {
          const assigneeId = assignee._id.toString();
          logger.info(`Sending task assignment notification to: ${assigneeId}`);
          
          io.to(`user:${assigneeId}`).emit('notification', {
            type: 'TASK_ASSIGNED',
            title: 'New Task Assigned',
            message: `You have been assigned to task "${task.title}" in project "${task.projectId?.name || 'Unknown'}"`,
            taskId: task._id.toString(),
            projectId: task.projectId?._id?.toString() || task.projectId?.toString(),
            projectName: task.projectId?.name,
            assignedBy: {
              id: req.user.id.toString(),
              name: `${req.user.firstName} ${req.user.lastName}`
            },
            timestamp: new Date()
          });
        }
      } catch (error) {
        logger.error('Error sending task assignment notification:', error);
      }
    }

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    logger.error('Update task error:', error);
    next(error);
  }
};

export const  updateTaskStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const task = await Task.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // EMPLOYEE can only update status of tasks assigned to them
    if (req.user && req.user.role === 'EMPLOYEE') {
      if (task.assigneeId?.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only update status of tasks assigned to you'
        });
      }
    }
    // PROJECT_MANAGER can update status of tasks in their projects
    else if (req.user && req.user.role === 'PROJECT_MANAGER') {
      const project = await Project.findById(task.projectId);
      if (project) {
        const isManager = project.managerId?.toString() === req.user.id || 
                         project.ownerId?.toString() === req.user.id;
        const isLeadMember = project.members?.some(
          m => m.userId?.toString() === req.user.id && m.role === 'LEAD'
        );

        if (!isManager && !isLeadMember) {
          return res.status(403).json({
            success: false,
            message: 'You can only update status of tasks in projects you manage'
          });
        }
      }
    }

      // // Validate status transition
      // if (!task.canTransitionTo(status)) {
      //   return res.status(400).json({
      //     success: false,
      //     message: `Invalid status transition from ${task.status} to ${status}`
      //   });
      // }

    const before = task.toObject();
    const oldStatus = task.status;
    task.status = status;
    await task.save();

    // Populate task for notification
    await task.populate('projectId', 'name managerId ownerId members');
    await task.populate('assigneeId', 'firstName lastName email');

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'TASK',
      resourceId: task._id,
      changes: { before, after: task.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    // Emit notification if employee changed status - notify project manager
    if (req.user.role === 'EMPLOYEE' && oldStatus !== status) {
      try {
        // Fetch the employee user to get firstName and lastName
        const employeeUser = await User.findById(req.user.id).select('firstName lastName email');
        if (!employeeUser) {
          logger.warn(`Employee user not found: ${req.user.id}`);
          return;
        }

        const project = await Project.findById(task.projectId)
          .populate('managerId', 'firstName lastName email')
          .populate('ownerId', 'firstName lastName email');
        const io = getIO();
        
        logger.info(`Employee ${employeeUser.firstName} ${employeeUser.lastName} (${req.user.id}) changed task ${task._id} status from ${oldStatus} to ${status}`);
        logger.info(`Project found: ${project ? 'Yes' : 'No'}, Manager: ${project?.managerId?._id || project?.managerId}, Owner: ${project?.ownerId?._id || project?.ownerId}`);
        
        // Get all connected sockets
        const allSockets = await io.fetchSockets();
        logger.info(`Total connected sockets: ${allSockets.length}`);
        
        // Helper function to force user into their room
        const forceUserIntoRoom = async (userId, roomName) => {
          const userIdStr = userId.toString();
          
          // Find all sockets for this user
          const userSockets = allSockets.filter(socket => {
            const socketUserId = socket.data?.userId || socket.userId;
            if (socketUserId) {
              return socketUserId.toString() === userIdStr;
            }
            return false;
          });
          
          if (userSockets.length > 0) {
            logger.info(`✅ Found ${userSockets.length} socket(s) for user ${userIdStr}, forcing into room ${roomName}`);
            // Force each socket into the room
            userSockets.forEach(socket => {
              socket.join(roomName);
              logger.info(`✅ Forced socket ${socket.id} into room ${roomName}`);
              // Also emit a join event to ensure frontend knows
              socket.emit('force:join:user', userIdStr);
            });
            return true;
          } else {
            logger.warn(`⚠️ No active socket found for user ${userIdStr}`);
            return false;
          }
        };
        
        // Notify project manager (ONLY, not employee)
        if (project?.managerId) {
          const managerId = project.managerId._id?.toString() || project.managerId.toString();
          const roomName = `user:${managerId}`;
          
          // Check if room exists
          let room = io.sockets.adapter.rooms.get(roomName);
          const roomSizeBefore = room ? room.size : 0;
          logger.info(`Room ${roomName} has ${roomSizeBefore} socket(s) before forcing`);
          
          // Force manager into room if not already there
          if (roomSizeBefore === 0) {
            logger.info(`⚠️ Manager not in room, forcing join...`);
            await forceUserIntoRoom(managerId, roomName);
            // Re-check room after forcing
            room = io.sockets.adapter.rooms.get(roomName);
            logger.info(`Room ${roomName} now has ${room ? room.size : 0} socket(s) after forcing`);
          }
          
          const employeeName = `${employeeUser.firstName} ${employeeUser.lastName}`;
          const notificationData = {
            type: 'TASK_STATUS_CHANGED',
            title: 'Task Status Updated',
            message: `${employeeName} changed task "${task.title}" status from ${oldStatus} to ${status}`,
            taskId: task._id.toString(),
            projectId: task.projectId?._id?.toString() || task.projectId?.toString(),
            projectName: project.name,
            changedBy: {
              id: req.user.id.toString(),
              name: employeeName
            },
            timestamp: new Date(),
            // Add targetUserId to ensure only manager receives it
            targetUserId: managerId
          };
          
          logger.info(`📤 Sending notification to room: ${roomName}`, notificationData);
          io.to(roomName).emit('notification', notificationData);
        }

        // Also notify project owner if different from manager
        if (project?.ownerId) {
          const ownerId = project.ownerId._id?.toString() || project.ownerId.toString();
          const managerId = project.managerId?._id?.toString() || project.managerId?.toString();
          
          if (ownerId !== managerId) {
            const roomName = `user:${ownerId}`;
            
            // Check if room exists
            let room = io.sockets.adapter.rooms.get(roomName);
            const roomSizeBefore = room ? room.size : 0;
            logger.info(`Room ${roomName} has ${roomSizeBefore} socket(s) before forcing`);
            
            // Force owner into room if not already there
            if (roomSizeBefore === 0) {
              logger.info(`⚠️ Owner not in room, forcing join...`);
              await forceUserIntoRoom(ownerId, roomName);
              // Re-check room after forcing
              room = io.sockets.adapter.rooms.get(roomName);
              logger.info(`Room ${roomName} now has ${room ? room.size : 0} socket(s) after forcing`);
            }
            
            const employeeName = `${employeeUser.firstName} ${employeeUser.lastName}`;
            const notificationData = {
              type: 'TASK_STATUS_CHANGED',
              title: 'Task Status Updated',
              message: `${employeeName} changed task "${task.title}" status from ${oldStatus} to ${status}`,
              taskId: task._id.toString(),
              projectId: task.projectId?._id?.toString() || task.projectId?.toString(),
              projectName: project.name,
              changedBy: {
                id: req.user.id.toString(),
                name: employeeName
              },
              timestamp: new Date(),
              // Add targetUserId to ensure only owner receives it
              targetUserId: ownerId
            };
            
            logger.info(`📤 Sending notification to room: ${roomName}`, notificationData);
            io.to(roomName).emit('notification', notificationData);
          }
        }
      } catch (error) {
        logger.error('Error sending task status change notification:', error);
        logger.error('Error stack:', error.stack);
      }
    }

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    logger.error('Update task status error:', error);
    next(error);
  }
};

export const deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // PROJECT_MANAGER can only delete tasks in their projects
    if (req.user && req.user.role === 'PROJECT_MANAGER') {
      const project = await Project.findById(task.projectId);
      if (project) {
        const isManager = project.managerId?.toString() === req.user.id || 
                         project.ownerId?.toString() === req.user.id;
        const isLeadMember = project.members?.some(
          m => m.userId?.toString() === req.user.id && m.role === 'LEAD'
        );

        if (!isManager && !isLeadMember) {
          return res.status(403).json({
            success: false,
            message: 'You can only delete tasks in projects you manage'
          });
        }
      }
    }

    const before = task.toObject();
    await task.deleteOne();

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user.id,
      action: 'DELETE',
      resourceType: 'TASK',
      resourceId: task._id,
      changes: { before },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    logger.error('Delete task error:', error);
    next(error);
  }
};

export const addComment = async (req, res, next) => {
  try {
    const { content } = req.body;
    const task = await Task.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // EMPLOYEE can only comment on tasks assigned to them
    if (req.user && req.user.role === 'EMPLOYEE') {
      if (task.assigneeId?.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only comment on tasks assigned to you'
        });
      }
    }
    // PROJECT_MANAGER can comment on tasks in their projects
    else if (req.user && req.user.role === 'PROJECT_MANAGER') {
      const project = await Project.findById(task.projectId);
      if (project) {
        const isManager = project.managerId?.toString() === req.user.id || 
                         project.ownerId?.toString() === req.user.id;
        const isLeadMember = project.members?.some(
          m => m.userId?.toString() === req.user.id && m.role === 'LEAD'
        );

        if (!isManager && !isLeadMember) {
          return res.status(403).json({
            success: false,
            message: 'You can only comment on tasks in projects you manage'
          });
        }
      }
    }

    task.comments.push({
      userId: req.user.id,
      content
    });
    await task.save();

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'TASK',
      resourceId: task._id,
      changes: { action: 'ADD_COMMENT' },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    logger.error('Add comment error:', error);
    next(error);
  }
};

export const updateComment = async (req, res, next) => {
  try {
    const { content } = req.body;
    const task = await Task.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // EMPLOYEE can only update comments on tasks assigned to them
    if (req.user && req.user.role === 'EMPLOYEE') {
      if (task.assigneeId?.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only update comments on tasks assigned to you'
        });
      }
    }

    const comment = task.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Only comment owner can update (or ORG_ADMIN)
    if (comment.userId.toString() !== req.user.id && req.user.role !== 'ORG_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this comment'
      });
    }

    comment.content = content;
    comment.updatedAt = new Date();
    await task.save();

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    logger.error('Update comment error:', error);
    next(error);
  }
};

export const deleteComment = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // EMPLOYEE can only delete comments on tasks assigned to them
    if (req.user && req.user.role === 'EMPLOYEE') {
      if (task.assigneeId?.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only delete comments on tasks assigned to you'
        });
      }
    }

    const comment = task.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Only comment owner or ORG_ADMIN can delete
    if (comment.userId.toString() !== req.user.id && req.user.role !== 'ORG_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this comment'
      });
    }

    comment.deleteOne();
    await task.save();

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    logger.error('Delete comment error:', error);
    next(error);
  }
};

