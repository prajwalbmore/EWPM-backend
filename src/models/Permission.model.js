import mongoose from 'mongoose';

const permissionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  permissions: {
    // Tenant Management
    manageTenants: {
      create: { type: Boolean, default: false },
      read: { type: Boolean, default: false },
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false }
    },
    // User Management
    manageUsers: {
      create: { type: Boolean, default: false },
      read: { type: Boolean, default: false },
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false }
    },
    // Project Management
    manageProjects: {
      create: { type: Boolean, default: false },
      read: { type: Boolean, default: false },
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false }
    },
    // Task Management
    manageTasks: {
      create: { type: Boolean, default: false },
      read: { type: Boolean, default: false },
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false },
      assign: { type: Boolean, default: false }
    },
    // Reports
    viewReports: {
      read: { type: Boolean, default: false }
    },
    // Audit Logs
    viewAuditLogs: {
      read: { type: Boolean, default: false }
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for user lookup
permissionSchema.index({ userId: 1, isActive: 1 });

// Static method to get default permissions for a role
permissionSchema.statics.getDefaultPermissionsForRole = function(role) {
  const defaultPermissions = {
    SUPER_ADMIN: {
      manageTenants: { create: true, read: true, update: true, delete: true },
      manageUsers: { create: true, read: true, update: true, delete: true },
      manageProjects: { create: false, read: false, update: false, delete: false },
      manageTasks: { create: false, read: false, update: false, delete: false, assign: false },
      viewReports: { read: false },
      viewAuditLogs: { read: true }
    },
    ORG_ADMIN: {
      manageTenants: { create: false, read: false, update: false, delete: false },
      manageUsers: { create: true, read: true, update: true, delete: true },
      manageProjects: { create: true, read: true, update: true, delete: true },
      manageTasks: { create: true, read: true, update: true, delete: true, assign: true },
      viewReports: { read: true },
      viewAuditLogs: { read: true }
    },
    PROJECT_MANAGER: {
      manageTenants: { create: false, read: false, update: false, delete: false },
      manageUsers: { create: false, read: false, update: false, delete: false },
      manageProjects: { create: true, read: true, update: true, delete: false },
      manageTasks: { create: true, read: true, update: true, delete: true, assign: true },
      viewReports: { read: true },
      viewAuditLogs: { read: false }
    },
    EMPLOYEE: {
      manageTenants: { create: false, read: false, update: false, delete: false },
      manageUsers: { create: false, read: false, update: false, delete: false },
      manageProjects: { create: false, read: true, update: false, delete: false },
      manageTasks: { create: false, read: true, update: true, delete: false, assign: false },
      viewReports: { read: false },
      viewAuditLogs: { read: false }
    }
  };

  return defaultPermissions[role] || defaultPermissions.EMPLOYEE;
};

const Permission = mongoose.model('Permission', permissionSchema);

export default Permission;

