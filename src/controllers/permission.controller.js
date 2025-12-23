import Permission from '../models/Permission.model.js';
import User from '../models/User.model.js';
import logger from '../utils/logger.js';
import { getIO } from '../utils/socket.js';

// Get manageable users (SUPER_ADMIN sees all, ORG_ADMIN sees only PROJECT_MANAGER and EMPLOYEE in their tenant)
export const getManageableUsers = async (req, res, next) => {
  try {
    let query = { isActive: true };
    let userRoles = [];

    if (req.user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN can manage all users
      userRoles = ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER', 'EMPLOYEE'];
    } else if (req.user.role === 'ORG_ADMIN') {
      // ORG_ADMIN can only manage PROJECT_MANAGER and EMPLOYEE in their tenant
      userRoles = ['PROJECT_MANAGER', 'EMPLOYEE'];
      query.tenantId = req.tenantId;
    } else {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage user permissions'
      });
    }

    query.role = { $in: userRoles };

    // Fetch users with their permissions
    const users = await User.find(query)
      .select('firstName lastName email role tenantId isActive')
      .sort({ firstName: 1, lastName: 1 })
      .lean();

    // Fetch permissions for these users
    const userIds = users.map((u) => u._id);
    const permissions = await Permission.find({
      userId: { $in: userIds },
      isActive: true
    }).lean();

    // Create a map of userId to permissions
    const permissionMap = {};
    permissions.forEach((p) => {
      permissionMap[p.userId.toString()] = p.permissions;
    });

    // Merge users with their permissions (or default permissions based on role)
    const usersWithPermissions = users.map((user) => {
      const userPermissions = permissionMap[user._id.toString()] || 
        Permission.getDefaultPermissionsForRole(user.role);
      
      return {
        userId: user._id,
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          isActive: user.isActive
        },
        permissions: userPermissions
      };
    });

    res.json({
      success: true,
      data: usersWithPermissions
    });
  } catch (error) {
    logger.error('Get manageable users error:', error);
    next(error);
  }
};

// Get permissions for a specific user
export const getUserPermissions = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await User.findById(userId).select('role tenantId');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Authorization checks
    if (req.user.role === 'ORG_ADMIN') {
      // ORG_ADMIN can only view PROJECT_MANAGER and EMPLOYEE in their tenant
      if (user.role !== 'PROJECT_MANAGER' && user.role !== 'EMPLOYEE') {
        return res.status(403).json({
          success: false,
          message: 'You can only view permissions for PROJECT_MANAGER and EMPLOYEE users'
        });
      }
      if (user.tenantId?.toString() !== req.tenantId?.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You can only view permissions for users in your tenant'
        });
      }
    }

    // Get permissions or use defaults
    let permission = await Permission.findOne({ userId, isActive: true });
    
    if (!permission) {
      // Return default permissions for the user's role
      const defaultPermissions = Permission.getDefaultPermissionsForRole(user.role);
      return res.json({
        success: true,
        data: {
          userId,
          user: {
            _id: user._id,
            role: user.role,
            tenantId: user.tenantId
          },
          permissions: defaultPermissions,
          isDefault: true
        }
      });
    }

    // Populate user info
    const userInfo = await User.findById(userId).select('firstName lastName email role tenantId');

    res.json({
      success: true,
      data: {
        userId: permission.userId,
        user: userInfo,
        permissions: permission.permissions,
        isDefault: false
      }
    });
  } catch (error) {
    logger.error('Get user permissions error:', error);
    next(error);
  }
};

// Update permissions for a user
export const updateUserPermissions = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    // Check if user exists
    const user = await User.findById(userId).select('role tenantId');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Authorization checks
    if (req.user.role === 'ORG_ADMIN') {
      // ORG_ADMIN can only update PROJECT_MANAGER and EMPLOYEE in their tenant
      if (user.role !== 'PROJECT_MANAGER' && user.role !== 'EMPLOYEE') {
        return res.status(403).json({
          success: false,
          message: 'You can only manage permissions for PROJECT_MANAGER and EMPLOYEE users'
        });
      }
      if (user.tenantId?.toString() !== req.tenantId?.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You can only manage permissions for users in your tenant'
        });
      }
    }

    // SUPER_ADMIN cannot update their own permissions (security)
    if (req.user.role === 'SUPER_ADMIN' && userId === req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify your own permissions'
      });
    }

    // ORG_ADMIN cannot update their own permissions
    if (req.user.role === 'ORG_ADMIN' && userId === req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify your own permissions'
      });
    }

    // Update or create permissions
    const updatedPermission = await Permission.findOneAndUpdate(
      { userId, isActive: true },
      { 
        permissions,
        updatedAt: new Date()
      },
      { new: true, upsert: true, runValidators: true }
    );

    logger.info(`Permissions updated for user ${userId} by user ${req.user.id}`);

    // Get user info
    const userInfo = await User.findById(userId).select('firstName lastName email role tenantId');
    
    // Get the user who made the change (for notification)
    const updatedByUser = await User.findById(req.user.id).select('firstName lastName email');

    // Emit socket event to notify the user and admins about permission changes
    const io = getIO();
    if (io) {
      const userIdStr = userId.toString();
      
      // Notify the user whose permissions were changed
      io.to(`user:${userIdStr}`).emit('permission:updated', {
        type: 'PERMISSION_UPDATED',
        userId: userIdStr,
        permissions: updatedPermission.permissions,
        updatedBy: {
          id: req.user.id,
          name: `${updatedByUser.firstName} ${updatedByUser.lastName}`
        },
        timestamp: new Date()
      });

      // Notify admins in the tenant (if applicable)
      if (userInfo.tenantId) {
        io.to(`tenant:${userInfo.tenantId}`).emit('permission:updated:admin', {
          type: 'PERMISSION_UPDATED_ADMIN',
          userId: userIdStr,
          user: {
            firstName: userInfo.firstName,
            lastName: userInfo.lastName,
            email: userInfo.email,
            role: userInfo.role
          },
          permissions: updatedPermission.permissions,
          updatedBy: {
            id: req.user.id,
            name: `${updatedByUser.firstName} ${updatedByUser.lastName}`
          },
          timestamp: new Date()
        });
      }

      logger.info(`Permission update notification sent to user ${userIdStr} and tenant ${userInfo.tenantId}`);
    }

    res.json({
      success: true,
      data: {
        userId: updatedPermission.userId,
        user: userInfo,
        permissions: updatedPermission.permissions
      },
      message: 'Permissions updated successfully'
    });
  } catch (error) {
    logger.error('Update user permissions error:', error);
    next(error);
  }
};

// Reset user permissions to role defaults
export const resetUserPermissions = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await User.findById(userId).select('role tenantId');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Authorization checks
    if (req.user.role === 'ORG_ADMIN') {
      if (user.role !== 'PROJECT_MANAGER' && user.role !== 'EMPLOYEE') {
        return res.status(403).json({
          success: false,
          message: 'You can only reset permissions for PROJECT_MANAGER and EMPLOYEE users'
        });
      }
      if (user.tenantId?.toString() !== req.tenantId?.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You can only reset permissions for users in your tenant'
        });
      }
    }

    // Get default permissions for the user's role
    const defaultPermissions = Permission.getDefaultPermissionsForRole(user.role);

    // Update or create permissions with defaults
    const updatedPermission = await Permission.findOneAndUpdate(
      { userId, isActive: true },
      { 
        permissions: defaultPermissions,
        updatedAt: new Date()
      },
      { new: true, upsert: true, runValidators: true }
    );

    logger.info(`Permissions reset to defaults for user ${userId} by user ${req.user.id}`);

    // Get user info
    const userInfo = await User.findById(userId).select('firstName lastName email role tenantId');
    
    // Get the user who made the change (for notification)
    const updatedByUser = await User.findById(req.user.id).select('firstName lastName email');

    // Emit socket event to notify the user and admins about permission changes
    const io = getIO();
    if (io) {
      const userIdStr = userId.toString();
      
      // Notify the user whose permissions were reset
      io.to(`user:${userIdStr}`).emit('permission:updated', {
        type: 'PERMISSION_RESET',
        userId: userIdStr,
        permissions: updatedPermission.permissions,
        updatedBy: {
          id: req.user.id,
          name: `${updatedByUser.firstName} ${updatedByUser.lastName}`
        },
        timestamp: new Date()
      });

      // Notify admins in the tenant (if applicable)
      if (userInfo.tenantId) {
        io.to(`tenant:${userInfo.tenantId}`).emit('permission:updated:admin', {
          type: 'PERMISSION_RESET_ADMIN',
          userId: userIdStr,
          user: {
            firstName: userInfo.firstName,
            lastName: userInfo.lastName,
            email: userInfo.email,
            role: userInfo.role
          },
          permissions: updatedPermission.permissions,
          updatedBy: {
            id: req.user.id,
            name: `${updatedByUser.firstName} ${updatedByUser.lastName}`
          },
          timestamp: new Date()
        });
      }

      logger.info(`Permission reset notification sent to user ${userIdStr} and tenant ${userInfo.tenantId}`);
    }

    res.json({
      success: true,
      data: {
        userId: updatedPermission.userId,
        user: userInfo,
        permissions: updatedPermission.permissions
      },
      message: 'Permissions reset to defaults successfully'
    });
  } catch (error) {
    logger.error('Reset user permissions error:', error);
    next(error);
  }
};
