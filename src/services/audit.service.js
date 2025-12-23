import AuditLog from '../models/AuditLog.model.js';
import logger from '../utils/logger.js';

export const createAuditLog = async (logData) => {
  try {
    const auditLog = await AuditLog.create({
      tenantId: logData.tenantId,
      userId: logData.userId,
      action: logData.action,
      resourceType: logData.resourceType,
      resourceId: logData.resourceId,
      changes: logData.changes || {},
      metadata: logData.metadata || {},
      timestamp: new Date()
    });

    return auditLog;
  } catch (error) {
    // Don't throw error - audit logging should not break the main flow
    logger.error('Failed to create audit log:', error);
    return null;
  }
};

export const getAuditLogsByResource = async (tenantId, resourceType, resourceId) => {
  try {
    return await AuditLog.find({
      tenantId,
      resourceType,
      resourceId
    }).sort({ timestamp: -1 });
  } catch (error) {
    logger.error('Failed to get audit logs by resource:', error);
    throw error;
  }
};

export const getAuditLogsByUser = async (tenantId, userId, limit = 100) => {
  try {
    return await AuditLog.find({
      tenantId,
      userId
    })
      .sort({ timestamp: -1 })
      .limit(limit);
  } catch (error) {
    logger.error('Failed to get audit logs by user:', error);
    throw error;
  }
};

