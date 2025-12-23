import Project from '../models/Project.model.js';
import Task from '../models/Task.model.js';
import User from '../models/User.model.js';
import { createAuditLog } from '../services/audit.service.js';
import { getIO } from '../utils/socket.js';
import logger from '../utils/logger.js';

export const getProjects = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, managerId } = req.query;
    const query = { tenantId: req.tenantId };

    // PROJECT_MANAGER can see projects they own, manage, or are members of
    if (req.user && req.user.role === 'PROJECT_MANAGER') {
      query.$or = [
        { managerId: req.user.id },
        { ownerId: req.user.id },
        { 'members.userId': req.user.id }
      ];
    }

    // EMPLOYEE can only see projects they are members of
    if (req.user && req.user.role === 'EMPLOYEE') {
      query['members.userId'] = req.user.id;
    }

    if (status) query.status = status;
    if (managerId) query.managerId = managerId;

    const projects = await Project.find(query)
      .populate('ownerId', 'firstName lastName email')
      .populate('managerId', 'firstName lastName email')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Project.countDocuments(query);

    res.json({
      success: true,
      data: projects,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get projects error:', error);
    next(error);
  }
};

export const getProjectById = async (req, res, next) => {
  try {
    const query = {
      _id: req.params.id,
      tenantId: req.tenantId
    };

    // PROJECT_MANAGER can see projects they own, manage, or are members of
    if (req.user && req.user.role === 'PROJECT_MANAGER') {
      query.$or = [
        { managerId: req.user.id },
        { ownerId: req.user.id },
        { 'members.userId': req.user.id }
      ];
    }

    // EMPLOYEE can only see projects they are members of
    if (req.user && req.user.role === 'EMPLOYEE') {
      query['members.userId'] = req.user.id;
    }

    const project = await Project.findOne(query)
      .populate('ownerId', 'firstName lastName email')
      .populate('managerId', 'firstName lastName email')
      .populate('members.userId', 'firstName lastName email');

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    logger.error('Get project by ID error:', error);
    next(error);
  }
};

export const createProject = async (req, res, next) => {
  try {
    // PROJECT_MANAGER can only set themselves as manager
    let managerId = req.user.id;
    if (req.user.role === 'ORG_ADMIN' && req.body.managerId) {
      managerId = req.body.managerId;
    } else if (req.user.role === 'PROJECT_MANAGER') {
      // PROJECT_MANAGER must be the manager of their own projects
      managerId = req.user.id;
    }

    // Process members array if provided
    let members = [];
    if (req.body.members && Array.isArray(req.body.members)) {
      members = req.body.members.map(member => ({
        userId: member.userId || member,
        role: member.role || 'MEMBER',
        joinedAt: new Date()
      }));
    }

    const projectData = {
      ...req.body,
      tenantId: req.tenantId,
      ownerId: req.user.id,
      managerId: managerId,
      members: members
    };

    // Remove members from req.body to avoid duplicate processing
    delete projectData.members;
    const project = await Project.create({
      ...projectData,
      members: members
    });

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user.id,
      action: 'CREATE',
      resourceType: 'PROJECT',
      resourceId: project._id,
      changes: { after: project.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    // Send notifications to all members added to the project
    if (members && members.length > 0) {
      try {
        // Fetch the creator's name
        const creator = await User.findById(req.user.id).select('firstName lastName');
        const creatorName = creator ? `${creator.firstName} ${creator.lastName}` : 'Someone';
        
        const io = getIO();
        const allSockets = await io.fetchSockets();
        
        // Helper function to force user into their room
        const forceUserIntoRoom = async (userId, roomName) => {
          const userIdStr = userId.toString();
          const userSockets = allSockets.filter(socket => {
            const socketUserId = socket.data?.userId || socket.userId;
            if (socketUserId) {
              return socketUserId.toString() === userIdStr;
            }
            return false;
          });
          
          if (userSockets.length > 0) {
            userSockets.forEach(socket => {
              socket.join(roomName);
              socket.emit('force:join:user', userIdStr);
            });
            return true;
          }
          return false;
        };

        // Send notification to each member
        for (const member of members) {
          const memberId = member.userId?.toString() || member.userId;
          if (!memberId) continue;
          
          // Skip if member is the creator
          if (memberId === req.user.id.toString()) continue;
          
          const roomName = `user:${memberId}`;
          
          // Force member into their room if not already there
          let room = io.sockets.adapter.rooms.get(roomName);
          if (!room || room.size === 0) {
            await forceUserIntoRoom(memberId, roomName);
            room = io.sockets.adapter.rooms.get(roomName);
          }
          
          const notificationData = {
            type: 'PROJECT_MEMBER_ADDED',
            title: 'Added to Project',
            message: `${creatorName} added you to project "${project.name}" as ${member.role || 'MEMBER'}`,
            projectId: project._id.toString(),
            projectName: project.name,
            memberRole: member.role || 'MEMBER',
            addedBy: {
              id: req.user.id.toString(),
              name: creatorName
            },
            timestamp: new Date(),
            targetUserId: memberId
          };
          
          logger.info(`📤 Sending project member notification to room: ${roomName}`, notificationData);
          io.to(roomName).emit('notification', notificationData);
        }
      } catch (error) {
        logger.error('Error sending project member notifications:', error);
        // Don't fail the request if notification fails
      }
    }

    res.status(201).json({
      success: true,
      data: project
    });
  } catch (error) {
    logger.error('Create project error:', error);
    next(error);
  }
};

export const updateProject = async (req, res, next) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const before = project.toObject();
    const oldMembers = project.members ? project.members.map(m => ({
      userId: m.userId?.toString() || m.userId.toString(),
      role: m.role
    })) : [];

    // Handle members update if provided
    let newMembers = [];
    if (req.body.members && Array.isArray(req.body.members)) {
      project.members = req.body.members.map(member => ({
        userId: member.userId || member,
        role: member.role || 'MEMBER',
        joinedAt: member.joinedAt || new Date()
      }));
      
      // Find newly added members (not in old members list)
      const newMembersList = project.members.map(m => ({
        userId: m.userId?.toString() || m.userId.toString(),
        role: m.role || 'MEMBER'
      }));
      
      newMembers = newMembersList.filter(newMember => 
        !oldMembers.some(oldMember => oldMember.userId === newMember.userId)
      );
      
      // Remove members from req.body to avoid duplicate processing
      delete req.body.members;
    }

    // Update other project fields
    Object.keys(req.body).forEach(key => {
      if (key !== 'tenantId' && key !== 'ownerId' && key !== '_id') {
        project[key] = req.body[key];
      }
    });

    await project.save();

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'PROJECT',
      resourceId: project._id,
      changes: { before, after: project.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    // Send notifications to newly added members
    if (newMembers && newMembers.length > 0) {
      try {
        // Fetch the updater's name
        const updater = await User.findById(req.user.id).select('firstName lastName');
        const updaterName = updater ? `${updater.firstName} ${updater.lastName}` : 'Someone';
        
        const io = getIO();
        const allSockets = await io.fetchSockets();
        
        // Helper function to force user into their room
        const forceUserIntoRoom = async (userId, roomName) => {
          const userIdStr = userId.toString();
          const userSockets = allSockets.filter(socket => {
            const socketUserId = socket.data?.userId || socket.userId;
            if (socketUserId) {
              return socketUserId.toString() === userIdStr;
            }
            return false;
          });
          
          if (userSockets.length > 0) {
            userSockets.forEach(socket => {
              socket.join(roomName);
              socket.emit('force:join:user', userIdStr);
            });
            return true;
          }
          return false;
        };

        // Send notification to each newly added member
        for (const member of newMembers) {
          const memberId = member.userId;
          if (!memberId) continue;
          
          // Skip if member is the updater
          if (memberId === req.user.id.toString()) continue;
          
          const roomName = `user:${memberId}`;
          
          // Force member into their room if not already there
          let room = io.sockets.adapter.rooms.get(roomName);
          if (!room || room.size === 0) {
            await forceUserIntoRoom(memberId, roomName);
            room = io.sockets.adapter.rooms.get(roomName);
          }
          
          const notificationData = {
            type: 'PROJECT_MEMBER_ADDED',
            title: 'Added to Project',
            message: `${updaterName} added you to project "${project.name}" as ${member.role || 'MEMBER'}`,
            projectId: project._id.toString(),
            projectName: project.name,
            memberRole: member.role || 'MEMBER',
            addedBy: {
              id: req.user.id.toString(),
              name: updaterName
            },
            timestamp: new Date(),
            targetUserId: memberId
          };
          
          logger.info(`📤 Sending project member notification to room: ${roomName}`, notificationData);
          io.to(roomName).emit('notification', notificationData);
        }
      } catch (error) {
        logger.error('Error sending project member notifications:', error);
        // Don't fail the request if notification fails
      }
    }

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    logger.error('Update project error:', error);
    next(error);
  }
};

export const deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check if project has tasks
    const taskCount = await Task.countDocuments({ projectId: project._id });
    if (taskCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete project with existing tasks'
      });
    }

    const before = project.toObject();
    await project.deleteOne();

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user.id,
      action: 'DELETE',
      resourceType: 'PROJECT',
      resourceId: project._id,
      changes: { before },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    logger.error('Delete project error:', error);
    next(error);
  }
};

export const addProjectMember = async (req, res, next) => {
  try {
    const { userId, role } = req.body;
    const project = await Project.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check if user is already a member
    const existingMember = project.members.find(
      m => m.userId.toString() === userId
    );

    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: 'User is already a project member'
      });
    }

    project.members.push({ userId, role: role || 'MEMBER' });
    await project.save();

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'PROJECT',
      resourceId: project._id,
      changes: { action: 'ADD_MEMBER', userId, role },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    // Send notification to the newly added member
    try {
      // Fetch the adder's name and project name
      const adder = await User.findById(req.user.id).select('firstName lastName');
      const adderName = adder ? `${adder.firstName} ${adder.lastName}` : 'Someone';
      
      const io = getIO();
      const allSockets = await io.fetchSockets();
      
      // Helper function to force user into their room
      const forceUserIntoRoom = async (userId, roomName) => {
        const userIdStr = userId.toString();
        const userSockets = allSockets.filter(socket => {
          const socketUserId = socket.data?.userId || socket.userId;
          if (socketUserId) {
            return socketUserId.toString() === userIdStr;
          }
          return false;
        });
        
        if (userSockets.length > 0) {
          userSockets.forEach(socket => {
            socket.join(roomName);
            socket.emit('force:join:user', userIdStr);
          });
          return true;
        }
        return false;
      };

      const memberId = userId.toString();
      const roomName = `user:${memberId}`;
      
      // Force member into their room if not already there
      let room = io.sockets.adapter.rooms.get(roomName);
      if (!room || room.size === 0) {
        await forceUserIntoRoom(memberId, roomName);
        room = io.sockets.adapter.rooms.get(roomName);
      }
      
      const notificationData = {
        type: 'PROJECT_MEMBER_ADDED',
        title: 'Added to Project',
        message: `${adderName} added you to project "${project.name}" as ${role || 'MEMBER'}`,
        projectId: project._id.toString(),
        projectName: project.name,
        memberRole: role || 'MEMBER',
        addedBy: {
          id: req.user.id.toString(),
          name: adderName
        },
        timestamp: new Date(),
        targetUserId: memberId
      };
      
      logger.info(`📤 Sending project member notification to room: ${roomName}`, notificationData);
      io.to(roomName).emit('notification', notificationData);
    } catch (error) {
      logger.error('Error sending project member notification:', error);
      // Don't fail the request if notification fails
    }

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    logger.error('Add project member error:', error);
    next(error);
  }
};

export const removeProjectMember = async (req, res, next) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    project.members = project.members.filter(
      m => m.userId.toString() !== req.params.userId
    );
    await project.save();

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'PROJECT',
      resourceId: project._id,
      changes: { action: 'REMOVE_MEMBER', userId: req.params.userId },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    logger.error('Remove project member error:', error);
    next(error);
  }
};

