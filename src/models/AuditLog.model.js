import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'CREATE', 'READ', 'UPDATE', 'DELETE',
      'LOGIN', 'LOGOUT', 'LOGIN_FAILED',
      'PERMISSION_DENIED', 'EXPORT', 'IMPORT'
    ],
    index: true
  },
  resourceType: {
    type: String,
    required: true,
    enum: ['USER', 'PROJECT', 'TASK', 'TENANT', 'AUDIT', 'REPORT'],
    index: true
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    device: String,
    location: String
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false // We use custom timestamp field
});

// Compound indexes for common queries
auditLogSchema.index({ tenantId: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

// TTL index to auto-delete old logs after 2 years (optional)
// auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 63072000 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;

