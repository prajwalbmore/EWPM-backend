import Tenant from '../models/Tenant.model.js';
import User from '../models/User.model.js';
import Project from '../models/Project.model.js';
import Task from '../models/Task.model.js';
import AuditLog from '../models/AuditLog.model.js';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

/**
 * Get dashboard data based on user role
 */
export const getDashboardData = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;
    // For SUPER_ADMIN, tenantId might not be set, which is fine
    const tenantId = req.tenantId || req.user.tenantId;

    let dashboardData = {};

    if (role === 'SUPER_ADMIN') {
      // SUPER_ADMIN: Global platform stats
      dashboardData = await getSuperAdminDashboard();
    } else if (role === 'ORG_ADMIN') {
      // ORG_ADMIN: Tenant-level stats
      dashboardData = await getOrgAdminDashboard(tenantId);
    } else if (role === 'PROJECT_MANAGER') {
      // PROJECT_MANAGER: Projects they manage
      dashboardData = await getProjectManagerDashboard(tenantId, userId);
    } else if (role === 'EMPLOYEE') {
      // EMPLOYEE: Assigned tasks only
      dashboardData = await getEmployeeDashboard(tenantId, userId);
    } else {
      return res.status(403).json({
        success: false,
        message: 'Invalid role'
      });
    }

    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    logger.error('Get dashboard data error:', error);
    next(error);
  }
};

/**
 * SUPER_ADMIN Dashboard
 */
async function getSuperAdminDashboard() {
  const stats = {
    totalTenants: await Tenant.countDocuments(),
    activeTenants: await Tenant.countDocuments({ isActive: true }),
    totalUsers: await User.countDocuments(),
    totalProjects: await Project.countDocuments(),
    totalTasks: await Task.countDocuments(),
  };

  const recentTenants = await Tenant.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .select('name subdomain isActive createdAt subscription');

  return {
    stats,
    recentTenants,
    role: 'SUPER_ADMIN'
  };
}

/**
 * ORG_ADMIN Dashboard
 */
async function getOrgAdminDashboard(tenantId) {
  const stats = {
    totalUsers: await User.countDocuments({ tenantId, role: { $ne: 'SUPER_ADMIN' } }),
    totalProjects: await Project.countDocuments({ tenantId }),
    activeTasks: await Task.countDocuments({
      tenantId,
      status: { $nin: ['DONE', 'CANCELLED'] }
    }),
    completedTasks: await Task.countDocuments({ tenantId, status: 'DONE' }),
  };

  const recentTasks = await Task.find({ tenantId })
    .populate('assigneeId', 'firstName lastName email')
    .populate('projectId', 'name')
    .sort({ createdAt: -1 })
    .limit(10)
    .select('title status projectId assigneeId createdAt');

  // Get SUPER_ADMIN user IDs to exclude their logs
  const superAdminUsers = await User.find({ role: 'SUPER_ADMIN' }).select('_id');
  const superAdminIds = superAdminUsers.map(u => u._id);
  
  // Fetch audit logs excluding SUPER_ADMIN logs
  const auditLogQuery = { 
    tenantId,
    ...(superAdminIds.length > 0 ? { userId: { $nin: superAdminIds } } : {})
  };
  
  const recentAuditLogs = await AuditLog.find(auditLogQuery)
    .populate('userId', 'firstName lastName email role')
    .sort({ timestamp: -1 })
    .limit(10)
    .select('action resourceType userId timestamp');
  
  // Double-check filter to ensure no SUPER_ADMIN logs slip through
  const filteredAuditLogs = recentAuditLogs.filter(log => {
    const userRole = log.userId?.role;
    return userRole !== 'SUPER_ADMIN';
  });

  return {
    stats,
    recentTasks,
    recentAuditLogs,
    role: 'ORG_ADMIN'
  };
}

/**
 * PROJECT_MANAGER Dashboard
 */
async function getProjectManagerDashboard(tenantId, userId) {
  // Get projects managed by this PROJECT_MANAGER or where they are members
  const managedProjects = await Project.find({
    tenantId,
    $or: [
      { managerId: userId },
      { ownerId: userId },
      { 'members.userId': userId }
    ]
  }).select('_id');

  const projectIds = managedProjects.map(p => p._id);

  const stats = {
    myProjects: managedProjects.length,
    activeTasks: projectIds.length > 0
      ? await Task.countDocuments({
          tenantId,
          projectId: { $in: projectIds },
          status: { $nin: ['DONE', 'CANCELLED'] }
        })
      : 0,
    completedTasks: projectIds.length > 0
      ? await Task.countDocuments({
          tenantId,
          projectId: { $in: projectIds },
          status: 'DONE'
        })
      : 0,
  };

  const recentTasks = projectIds.length > 0
    ? await Task.find({
        tenantId,
        projectId: { $in: projectIds }
      })
        .populate('assigneeId', 'firstName lastName email')
        .populate('projectId', 'name')
        .sort({ createdAt: -1 })
        .limit(10)
        .select('title status projectId assigneeId createdAt')
    : [];

  return {
    stats,
    recentTasks,
    role: 'PROJECT_MANAGER'
  };
}

/**
 * EMPLOYEE Dashboard
 */
async function getEmployeeDashboard(tenantId, userId) {
  const stats = {
    myActiveTasks: await Task.countDocuments({
      tenantId,
      assigneeId: userId,
      status: { $nin: ['DONE', 'CANCELLED'] }
    }),
    myCompletedTasks: await Task.countDocuments({
      tenantId,
      assigneeId: userId,
      status: 'DONE'
    }),
  };

  const recentTasks = await Task.find({
    tenantId,
    assigneeId: userId
  })
    .populate('assigneeId', 'firstName lastName email')
    .populate('projectId', 'name')
    .sort({ createdAt: -1 })
    .limit(10)
    .select('title status projectId assigneeId createdAt');

  return {
    stats,
    recentTasks,
    role: 'EMPLOYEE'
  };
}

/**
 * Get dashboard statistics summary
 */
export const getDashboardStats = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;
    // For SUPER_ADMIN, tenantId might not be set, which is fine
    const tenantId = req.tenantId || req.user.tenantId;

    let stats = {};

    if (role === 'SUPER_ADMIN') {
      stats = {
        totalTenants: await Tenant.countDocuments(),
        activeTenants: await Tenant.countDocuments({ isActive: true }),
        totalUsers: await User.countDocuments(),
        totalProjects: await Project.countDocuments(),
        totalTasks: await Task.countDocuments(),
      };
    } else if (role === 'ORG_ADMIN') {
      stats = {
        totalUsers: await User.countDocuments({ tenantId, role: { $ne: 'SUPER_ADMIN' } }),
        totalProjects: await Project.countDocuments({ tenantId }),
        activeTasks: await Task.countDocuments({
          tenantId,
          status: { $nin: ['DONE', 'CANCELLED'] }
        }),
        completedTasks: await Task.countDocuments({ tenantId, status: 'DONE' }),
      };
    } else if (role === 'PROJECT_MANAGER') {
      const managedProjects = await Project.find({
        tenantId,
        $or: [
          { managerId: userId },
          { ownerId: userId },
          { 'members.userId': userId }
        ]
      }).select('_id');

      const projectIds = managedProjects.map(p => p._id);

      stats = {
        myProjects: managedProjects.length,
        activeTasks: projectIds.length > 0
          ? await Task.countDocuments({
              tenantId,
              projectId: { $in: projectIds },
              status: { $nin: ['DONE', 'CANCELLED'] }
            })
          : 0,
        completedTasks: projectIds.length > 0
          ? await Task.countDocuments({
              tenantId,
              projectId: { $in: projectIds },
              status: 'DONE'
            })
          : 0,
      };
    } else if (role === 'EMPLOYEE') {
      stats = {
        myActiveTasks: await Task.countDocuments({
          tenantId,
          assigneeId: userId,
          status: { $nin: ['DONE', 'CANCELLED'] }
        }),
        myCompletedTasks: await Task.countDocuments({
          tenantId,
          assigneeId: userId,
          status: 'DONE'
        }),
      };
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Get dashboard stats error:', error);
    next(error);
  }
};

