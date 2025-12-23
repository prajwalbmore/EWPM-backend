import Task from '../models/Task.model.js';
import Project from '../models/Project.model.js';
import User from '../models/User.model.js';
import logger from '../utils/logger.js';

export const getProductivityReport = async (req, res, next) => {
  try {
    const { startDate, endDate, userId } = req.query;
    const matchQuery = { tenantId: req.tenantId };

    // PROJECT_MANAGER can only see reports for their projects
    if (req.user && req.user.role === 'PROJECT_MANAGER') {
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
        matchQuery.projectId = { $in: projectIds };
      } else {
        // No projects managed, return empty
        matchQuery.projectId = { $in: [] };
      }
    }

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    if (userId) matchQuery.assigneeId = userId;

    const report = await Task.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$assigneeId',
          totalTasks: { $sum: 1 },
          completedTasks: {
            $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] }
          },
          totalEstimatedHours: { $sum: '$estimatedHours' },
          totalActualHours: { $sum: '$actualHours' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: '$_id',
          userName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
          totalTasks: 1,
          completedTasks: 1,
          completionRate: {
            $cond: [
              { $gt: ['$totalTasks', 0] },
              { $multiply: [{ $divide: ['$completedTasks', '$totalTasks'] }, 100] },
              0
            ]
          },
          totalEstimatedHours: 1,
          totalActualHours: 1
        }
      }
    ]);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Get productivity report error:', error);
    next(error);
  }
};

export const getProjectCompletionReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const matchQuery = { tenantId: req.tenantId };

    // PROJECT_MANAGER can only see reports for their projects
    if (req.user && req.user.role === 'PROJECT_MANAGER') {
      matchQuery.$or = [
        { managerId: req.user.id },
        { ownerId: req.user.id },
        { 'members.userId': req.user.id, 'members.role': 'LEAD' }
      ];
    }

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const report = await Project.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'tasks',
          localField: '_id',
          foreignField: 'projectId',
          as: 'tasks'
        }
      },
      {
        $project: {
          name: 1,
          status: 1,
          startDate: 1,
          endDate: 1,
          actualEndDate: 1,
          totalTasks: { $size: '$tasks' },
          completedTasks: {
            $size: {
              $filter: {
                input: '$tasks',
                as: 'task',
                cond: { $eq: ['$$task.status', 'DONE'] }
              }
            }
          },
          completionRate: {
            $cond: [
              { $gt: [{ $size: '$tasks' }, 0] },
              {
                $multiply: [
                  {
                    $divide: [
                      {
                        $size: {
                          $filter: {
                            input: '$tasks',
                            as: 'task',
                            cond: { $eq: ['$$task.status', 'DONE'] }
                          }
                        }
                      },
                      { $size: '$tasks' }
                    ]
                  },
                  100
                ]
              },
              0
            ]
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Get project completion report error:', error);
    next(error);
  }
};

export const getTimeTrackingReport = async (req, res, next) => {
  try {
    const { startDate, endDate, projectId, userId } = req.query;
    const matchQuery = { tenantId: req.tenantId };

    // PROJECT_MANAGER can only see reports for their projects
    if (req.user && req.user.role === 'PROJECT_MANAGER') {
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
        // If specific project requested, verify it's managed
        if (projectId) {
          if (!projectIds.some(id => id.toString() === projectId)) {
            return res.status(403).json({
              success: false,
              message: 'You can only view reports for projects you manage'
            });
          }
          matchQuery.projectId = projectId;
        } else {
          matchQuery.projectId = { $in: projectIds };
        }
      } else {
        // No projects managed, return empty
        matchQuery.projectId = { $in: [] };
      }
    } else if (projectId) {
      matchQuery.projectId = projectId;
    }

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    if (userId) matchQuery.assigneeId = userId;

    const report = await Task.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            projectId: '$projectId',
            assigneeId: '$assigneeId'
          },
          totalEstimatedHours: { $sum: '$estimatedHours' },
          totalActualHours: { $sum: '$actualHours' },
          taskCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'projects',
          localField: '_id.projectId',
          foreignField: '_id',
          as: 'project'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id.assigneeId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $project: {
          projectId: '$_id.projectId',
          projectName: { $arrayElemAt: ['$project.name', 0] },
          assigneeId: '$_id.assigneeId',
          assigneeName: {
            $concat: [
              { $arrayElemAt: ['$user.firstName', 0] },
              ' ',
              { $arrayElemAt: ['$user.lastName', 0] }
            ]
          },
          totalEstimatedHours: 1,
          totalActualHours: 1,
          taskCount: 1,
          variance: { $subtract: ['$totalActualHours', '$totalEstimatedHours'] }
        }
      }
    ]);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Get time tracking report error:', error);
    next(error);
  }
};

// User Activity Report
export const getUserActivityReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const matchQuery = { tenantId: req.tenantId };

    // PROJECT_MANAGER can only see reports for their projects
    let projectIds = [];
    if (req.user && req.user.role === 'PROJECT_MANAGER') {
      const managedProjects = await Project.find({
        tenantId: req.tenantId,
        $or: [
          { managerId: req.user.id },
          { ownerId: req.user.id },
          { 'members.userId': req.user.id }
        ]
      }).select('_id');
      projectIds = managedProjects.map(p => p._id);
    }

    // Get user activity from tasks
    const taskMatchQuery = { ...matchQuery };
    if (projectIds.length > 0) {
      taskMatchQuery.projectId = { $in: projectIds };
    } else if (req.user && req.user.role === 'PROJECT_MANAGER') {
      taskMatchQuery.projectId = { $in: [] };
    }

    if (startDate || endDate) {
      taskMatchQuery.createdAt = {};
      if (startDate) taskMatchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) taskMatchQuery.createdAt.$lte = new Date(endDate);
    }

    const report = await Task.aggregate([
      { $match: taskMatchQuery },
      {
        $group: {
          _id: '$assigneeId',
          totalTasks: { $sum: 1 },
          completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] } },
          inProgressTasks: { $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] } },
          blockedTasks: { $sum: { $cond: [{ $eq: ['$status', 'BLOCKED'] }, 1, 0] } },
          totalEstimatedHours: { $sum: '$estimatedHours' },
          totalActualHours: { $sum: '$actualHours' },
          avgTaskCompletionTime: {
            $avg: {
              $cond: [
                { $eq: ['$status', 'DONE'] },
                { $subtract: ['$updatedAt', '$createdAt'] },
                null
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: '$_id',
          userName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
          userEmail: '$user.email',
          userRole: '$user.role',
          totalTasks: 1,
          completedTasks: 1,
          inProgressTasks: 1,
          blockedTasks: 1,
          completionRate: {
            $cond: [
              { $gt: ['$totalTasks', 0] },
              { $multiply: [{ $divide: ['$completedTasks', '$totalTasks'] }, 100] },
              0
            ]
          },
          totalEstimatedHours: 1,
          totalActualHours: 1,
          efficiency: {
            $cond: [
              { $gt: ['$totalEstimatedHours', 0] },
              { $multiply: [{ $divide: ['$totalEstimatedHours', { $ifNull: ['$totalActualHours', 1] }] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { totalTasks: -1 } }
    ]);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Get user activity report error:', error);
    next(error);
  }
};

// Task Status Distribution Report
export const getTaskStatusReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const matchQuery = { tenantId: req.tenantId };

    // PROJECT_MANAGER can only see reports for their projects
    let projectIds = [];
    if (req.user && req.user.role === 'PROJECT_MANAGER') {
      const managedProjects = await Project.find({
        tenantId: req.tenantId,
        $or: [
          { managerId: req.user.id },
          { ownerId: req.user.id },
          { 'members.userId': req.user.id }
        ]
      }).select('_id');
      projectIds = managedProjects.map(p => p._id);
      if (projectIds.length > 0) {
        matchQuery.projectId = { $in: projectIds };
      } else {
        matchQuery.projectId = { $in: [] };
      }
    }

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const report = await Task.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalEstimatedHours: { $sum: '$estimatedHours' },
          totalActualHours: { $sum: '$actualHours' }
        }
      },
      {
        $project: {
          status: '$_id',
          count: 1,
          totalEstimatedHours: 1,
          totalActualHours: 1
        }
      },
      { $sort: { count: -1 } }
    ]);

    const total = report.reduce((sum, item) => sum + item.count, 0);

    res.json({
      success: true,
      data: report.map(item => ({
        ...item,
        percentage: total > 0 ? ((item.count / total) * 100).toFixed(1) : 0
      })),
      total
    });
  } catch (error) {
    logger.error('Get task status report error:', error);
    next(error);
  }
};

// Budget vs Actual Report
export const getBudgetReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const matchQuery = { tenantId: req.tenantId };

    // PROJECT_MANAGER can only see reports for their projects
    if (req.user && req.user.role === 'PROJECT_MANAGER') {
      matchQuery.$or = [
        { managerId: req.user.id },
        { ownerId: req.user.id },
        { 'members.userId': req.user.id }
      ];
    }

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const report = await Project.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'tasks',
          localField: '_id',
          foreignField: 'projectId',
          as: 'tasks'
        }
      },
      {
        $project: {
          name: 1,
          status: 1,
          budget: 1,
          spent: 1,
          startDate: 1,
          endDate: 1,
          totalTasks: { $size: '$tasks' },
          completedTasks: {
            $size: {
              $filter: {
                input: '$tasks',
                as: 'task',
                cond: { $eq: ['$$task.status', 'DONE'] }
              }
            }
          },
          totalEstimatedHours: { $sum: '$tasks.estimatedHours' },
          totalActualHours: { $sum: '$tasks.actualHours' }
        }
      },
      {
        $project: {
          name: 1,
          status: 1,
          budget: 1,
          spent: 1,
          startDate: 1,
          endDate: 1,
          totalTasks: 1,
          completedTasks: 1,
          totalEstimatedHours: 1,
          totalActualHours: 1,
          budgetUtilization: {
            $cond: [
              { $gt: ['$budget', 0] },
              { $multiply: [{ $divide: [{ $ifNull: ['$spent', 0] }, '$budget'] }, 100] },
              0
            ]
          },
          budgetRemaining: {
            $subtract: [
              { $ifNull: ['$budget', 0] },
              { $ifNull: ['$spent', 0] }
            ]
          },
          variance: {
            $subtract: [
              { $ifNull: ['$totalActualHours', 0] },
              { $ifNull: ['$totalEstimatedHours', 0] }
            ]
          }
        }
      },
      { $sort: { budgetUtilization: -1 } }
    ]);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Get budget report error:', error);
    next(error);
  }
};

// Task Trends Report (by date)
export const getTaskTrendsReport = async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    const matchQuery = { tenantId: req.tenantId };

    // PROJECT_MANAGER can only see reports for their projects
    let projectIds = [];
    if (req.user && req.user.role === 'PROJECT_MANAGER') {
      const managedProjects = await Project.find({
        tenantId: req.tenantId,
        $or: [
          { managerId: req.user.id },
          { ownerId: req.user.id },
          { 'members.userId': req.user.id }
        ]
      }).select('_id');
      projectIds = managedProjects.map(p => p._id);
      if (projectIds.length > 0) {
        matchQuery.projectId = { $in: projectIds };
      } else {
        matchQuery.projectId = { $in: [] };
      }
    }

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    let dateFormat;
    if (groupBy === 'day') {
      dateFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    } else if (groupBy === 'week') {
      dateFormat = { $dateToString: { format: '%Y-W%V', date: '$createdAt' } };
    } else {
      dateFormat = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
    }

    const report = await Task.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: dateFormat,
          created: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          date: '$_id',
          created: 1,
          completed: 1,
          inProgress: 1
        }
      },
      { $sort: { date: 1 } }
    ]);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Get task trends report error:', error);
    next(error);
  }
};

// Priority Distribution Report
export const getPriorityReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const matchQuery = { tenantId: req.tenantId };

    // PROJECT_MANAGER can only see reports for their projects
    let projectIds = [];
    if (req.user && req.user.role === 'PROJECT_MANAGER') {
      const managedProjects = await Project.find({
        tenantId: req.tenantId,
        $or: [
          { managerId: req.user.id },
          { ownerId: req.user.id },
          { 'members.userId': req.user.id }
        ]
      }).select('_id');
      projectIds = managedProjects.map(p => p._id);
      if (projectIds.length > 0) {
        matchQuery.projectId = { $in: projectIds };
      } else {
        matchQuery.projectId = { $in: [] };
      }
    }

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const report = await Task.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] } },
          avgCompletionTime: {
            $avg: {
              $cond: [
                { $eq: ['$status', 'DONE'] },
                { $subtract: ['$updatedAt', '$createdAt'] },
                null
              ]
            }
          }
        }
      },
      {
        $project: {
          priority: '$_id',
          count: 1,
          completed: 1,
          completionRate: {
            $cond: [
              { $gt: ['$count', 0] },
              { $multiply: [{ $divide: ['$completed', '$count'] }, 100] },
              0
            ]
          },
          avgCompletionTime: 1
        }
      },
      { $sort: { count: -1 } }
    ]);

    const total = report.reduce((sum, item) => sum + item.count, 0);

    res.json({
      success: true,
      data: report.map(item => ({
        ...item,
        percentage: total > 0 ? ((item.count / total) * 100).toFixed(1) : 0
      })),
      total
    });
  } catch (error) {
    logger.error('Get priority report error:', error);
    next(error);
  }
};

// Team Utilization Report
export const getTeamUtilizationReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const matchQuery = { tenantId: req.tenantId };

    // PROJECT_MANAGER can only see reports for their projects
    let projectIds = [];
    if (req.user && req.user.role === 'PROJECT_MANAGER') {
      const managedProjects = await Project.find({
        tenantId: req.tenantId,
        $or: [
          { managerId: req.user.id },
          { ownerId: req.user.id },
          { 'members.userId': req.user.id }
        ]
      }).select('_id');
      projectIds = managedProjects.map(p => p._id);
    }

    const taskMatchQuery = { ...matchQuery };
    if (projectIds.length > 0) {
      taskMatchQuery.projectId = { $in: projectIds };
    } else if (req.user && req.user.role === 'PROJECT_MANAGER') {
      taskMatchQuery.projectId = { $in: [] };
    }

    if (startDate || endDate) {
      taskMatchQuery.createdAt = {};
      if (startDate) taskMatchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) taskMatchQuery.createdAt.$lte = new Date(endDate);
    }

    const report = await Task.aggregate([
      { $match: taskMatchQuery },
      {
        $group: {
          _id: '$assigneeId',
          activeTasks: {
            $sum: {
              $cond: [
                { $in: ['$status', ['TODO', 'IN_PROGRESS', 'IN_REVIEW']] },
                1,
                0
              ]
            }
          },
          totalTasks: { $sum: 1 },
          totalEstimatedHours: { $sum: '$estimatedHours' },
          totalActualHours: { $sum: '$actualHours' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: '$_id',
          userName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
          userEmail: '$user.email',
          activeTasks: 1,
          totalTasks: 1,
          totalEstimatedHours: 1,
          totalActualHours: 1,
          utilizationRate: {
            $cond: [
              { $gt: ['$totalEstimatedHours', 0] },
              { $multiply: [{ $divide: [{ $ifNull: ['$totalActualHours', 0] }, '$totalEstimatedHours'] }, 100] },
              0
            ]
          },
          workload: {
            $cond: [
              { $gt: ['$activeTasks', 0] },
              { $divide: ['$totalEstimatedHours', '$activeTasks'] },
              0
            ]
          }
        }
      },
      { $sort: { activeTasks: -1 } }
    ]);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Get team utilization report error:', error);
    next(error);
  }
};

export const exportReport = async (req, res, next) => {
  try {
    const { type } = req.params;
    // TODO: Implement CSV/PDF export functionality
    res.status(501).json({
      success: false,
      message: 'Export functionality not implemented yet'
    });
  } catch (error) {
    logger.error('Export report error:', error);
    next(error);
  }
};

