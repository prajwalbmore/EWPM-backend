import AuditLog from '../models/AuditLog.model.js';
import User from '../models/User.model.js';
import logger from '../utils/logger.js';

export const getAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, action, resourceType, userId, startDate, endDate } = req.query;
    const query = { tenantId: req.tenantId };

    if (action) query.action = action;
    if (resourceType) query.resourceType = resourceType;
    if (userId) query.userId = userId;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const superAdminUsers = await User.find({ role: 'SUPER_ADMIN' }).select('_id');
    const superAdminIds = superAdminUsers.map(u => u._id);
    

    if (superAdminIds.length > 0) {
      if (query.userId) {
        query.userId = { $eq: query.userId, $nin: superAdminIds };
      } else {
        query.userId = { $nin: superAdminIds };
      }
    }

    const logs = await AuditLog.find(query)
      .populate('userId', 'firstName lastName email role')
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const filteredLogs = logs.filter(log => {
      const userRole = log.userId?.role || (log.userId?.constructor?.name === 'Object' ? null : null);
      return userRole !== 'SUPER_ADMIN';
    });

    const countQuery = { tenantId: req.tenantId };
    if (action) countQuery.action = action;
    if (resourceType) countQuery.resourceType = resourceType;
    if (startDate || endDate) {
      countQuery.timestamp = {};
      if (startDate) countQuery.timestamp.$gte = new Date(startDate);
      if (endDate) countQuery.timestamp.$lte = new Date(endDate);
    }
    
    if (superAdminIds.length > 0) {
      if (userId) {
        countQuery.userId = { $eq: userId, $nin: superAdminIds };
      } else {
        countQuery.userId = { $nin: superAdminIds };
      }
    } else if (userId) {
      countQuery.userId = userId;
    }
    
    const total = await AuditLog.countDocuments(countQuery);

    res.json({
      success: true,
      data: filteredLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get audit logs error:', error);
    next(error);
  }
};

export const getAuditLogById = async (req, res, next) => {
  try {
    const log = await AuditLog.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    }).populate('userId', 'firstName lastName email');

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Audit log not found'
      });
    }

    res.json({
      success: true,
      data: log
    });
  } catch (error) {
    logger.error('Get audit log by ID error:', error);
    next(error);
  }
};

export const getUserAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const logs = await AuditLog.find({
      tenantId: req.tenantId,
      userId: req.params.userId
    })
      .populate('userId', 'firstName lastName email')
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await AuditLog.countDocuments({
      tenantId: req.tenantId,
      userId: req.params.userId
    });

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get user audit logs error:', error);
    next(error);
  }
};

export const getResourceAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const logs = await AuditLog.find({
      tenantId: req.tenantId,
      resourceType: req.params.resourceType,
      resourceId: req.params.resourceId
    })
      .populate('userId', 'firstName lastName email')
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await AuditLog.countDocuments({
      tenantId: req.tenantId,
      resourceType: req.params.resourceType,
      resourceId: req.params.resourceId
    });

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get resource audit logs error:', error);
    next(error);
  }
};

