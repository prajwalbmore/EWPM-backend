import logger from '../utils/logger.js';

/**
 * Middleware to prevent SUPER_ADMIN from doing day-to-day tenant work
 * SUPER_ADMIN should only manage tenants, not projects/tasks within tenants
 */
export const preventSuperAdminTenantWork = (req, res, next) => {
  if (req.user && req.user.role === 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'SUPER_ADMIN cannot perform tenant-level operations. Use tenant management instead.'
    });
  }
  next();
};

/**
 * Middleware to ensure PROJECT_MANAGER can only access their own projects
 */
export const restrictToOwnProjects = async (req, res, next) => {
  try {
    if (req.user && req.user.role === 'PROJECT_MANAGER') {
      const Project = (await import('../models/Project.model.js')).default;
      const projectId = req.params.id || req.body.projectId || req.query.projectId;

      if (projectId) {
        const project = await Project.findOne({
          _id: projectId,
          tenantId: req.tenantId
        });

        if (!project) {
          return res.status(404).json({
            success: false,
            message: 'Project not found'
          });
        }

        // Check if user is the manager or owner of the project
        const isManager = project.managerId?.toString() === req.user.id || 
                         project.ownerId?.toString() === req.user.id;
        const isMember = project.members?.some(
          m => m.userId?.toString() === req.user.id && m.role === 'LEAD'
        );

        if (!isManager && !isMember) {
          return res.status(403).json({
            success: false,
            message: 'You can only manage projects you own or manage'
          });
        }
      }
    }
    next();
  } catch (error) {
    logger.error('Restrict to own projects error:', error);
    next(error);
  }
};

/**
 * Middleware to ensure EMPLOYEE can only access their own tasks
 * Only applies to single task operations (by ID), not list views
 */
export const restrictToOwnTasks = async (req, res, next) => {
  try {
    if (req.user && req.user.role === 'EMPLOYEE') {
      const Task = (await import('../models/Task.model.js')).default;
      const taskId = req.params.id || req.body.taskId;

      if (taskId) {
        const task = await Task.findOne({
          _id: taskId,
          tenantId: req.tenantId
        });

        if (!task) {
          return res.status(404).json({
            success: false,
            message: 'Task not found'
          });
        }

        // Employee can only access tasks assigned to them
        if (task.assigneeId?.toString() !== req.user.id) {
          return res.status(403).json({
            success: false,
            message: 'You can only access tasks assigned to you'
          });
        }
      }
      // For list operations, filtering is handled in the controller
    }
    next();
  } catch (error) {
    logger.error('Restrict to own tasks error:', error);
    next(error);
  }
};

/**
 * Middleware to check if user can assign tasks
 * Only ORG_ADMIN, PROJECT_MANAGER can assign tasks
 */
export const canAssignTasks = (req, res, next) => {
  const allowedRoles = ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER'];
  
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to assign tasks'
    });
  }
  next();
};

/**
 * Middleware to check if user can manage projects
 */
export const canManageProjects = (req, res, next) => {
  const allowedRoles = ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER'];
  
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to manage projects'
    });
  }
  next();
};

/**
 * Middleware to check if user can manage users
 */
export const canManageUsers = (req, res, next) => {
  const allowedRoles = ['SUPER_ADMIN', 'ORG_ADMIN'];
  
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to manage users'
    });
  }
  next();
};

