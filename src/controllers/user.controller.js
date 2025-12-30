import User from '../models/User.model.js';
import { createAuditLog } from '../services/audit.service.js';
import logger from '../utils/logger.js';

export const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role, isActive } = req.query;
    const query = {};
console.log("req.tenantId........................................................",req.tenantId)
    // Exclude the logged-in user from the list
    if (req.tenantId && req.tenantId !== 'all') {
      query.tenantId = req.tenantId;
    }
    if (req.user && req.user.id) {
      query._id = { $ne: req.user.id };
    }

    // If user is ORG_ADMIN, exclude SUPER_ADMIN users (they shouldn't see super admins)
    // Only show users from their own organization
    if (req.user && req.user.role === 'ORG_ADMIN') {
      // Exclude SUPER_ADMIN role
      query.role = { $ne: 'SUPER_ADMIN' };
      
      // If a role filter is provided, combine it with the exclusion
      if (role && role.trim() !== '') {
        // If filtering for a specific role, ensure it's not SUPER_ADMIN
        if (role !== 'SUPER_ADMIN') {
          query.role = role;
        } else {
          // If trying to filter for SUPER_ADMIN, return empty (ORG_ADMIN can't see them)
          return res.json({
            success: true,
            data: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              pages: 0
            }
          });
        }
      }
    } else {
      // For SUPER_ADMIN, apply role filter normally
      if (role && role.trim() !== '') {
        query.role = role;
      }
    }

    // Apply isActive filter only if explicitly provided
    if (isActive !== undefined && isActive !== '') {
      // Convert string 'true'/'false' to boolean
      query.isActive = isActive === 'true' || isActive === true;
    }

    const users = await User.find(query)
      .select('-password -refreshToken')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get users error:', error);
    next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const query = {
      _id: req.params.id,
      tenantId: req.tenantId
    };

    // If user is ORG_ADMIN, exclude SUPER_ADMIN users
    if (req.user && req.user.role === 'ORG_ADMIN') {
      query.role = { $ne: 'SUPER_ADMIN' };
    }

    const user = await User.findOne(query).select('-password -refreshToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Get user by ID error:', error);
    next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    // Prevent ORG_ADMIN from creating SUPER_ADMIN users
    if (req.user && req.user.role === 'ORG_ADMIN' && req.body.role === 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create SUPER_ADMIN users'
      });
    }

    // Determine tenantId
    let tenantId = req.tenantId;
    
    // SUPER_ADMIN can specify tenantId in request body (for non-SUPER_ADMIN users)
    if (req.user && req.user.role === 'SUPER_ADMIN' && req.body.tenantId) {
      tenantId = req.body.tenantId;
    }
    
    // SUPER_ADMIN users should not have a tenantId
    if (req.body.role === 'SUPER_ADMIN') {
      tenantId = null;
    }
    
    // Validate tenantId is provided (for non-SUPER_ADMIN users)
    if (!tenantId && req.body.role !== 'SUPER_ADMIN') {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required for this role'
      });
    }

    const userData = {
      ...req.body,
      tenantId: tenantId
    };

    const user = await User.create(userData);

    await createAuditLog({
      tenantId: tenantId || req.tenantId || user.tenantId,
      userId: req.user.id,
      action: 'CREATE',
      resourceType: 'USER',
      resourceId: user._id,
      changes: { after: user.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.status(201).json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Create user error:', error);
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const query = {
      _id: req.params.id,
      tenantId: req.tenantId
    };

    // If user is ORG_ADMIN, exclude SUPER_ADMIN users
    if (req.user && req.user.role === 'ORG_ADMIN') {
      query.role = { $ne: 'SUPER_ADMIN' };
    }

    const user = await User.findOne(query);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent ORG_ADMIN from creating or updating users to SUPER_ADMIN role
    if (req.user && req.user.role === 'ORG_ADMIN' && req.body.role === 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to assign SUPER_ADMIN role'
      });
    }

    const before = user.toObject();
    Object.assign(user, req.body);
    await user.save();

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'USER',
      resourceId: user._id,
      changes: { before, after: user.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Update user error:', error);
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const query = {
      _id: req.params.id,
      tenantId: req.tenantId
    };

    // If user is ORG_ADMIN, exclude SUPER_ADMIN users
    if (req.user && req.user.role === 'ORG_ADMIN') {
      query.role = { $ne: 'SUPER_ADMIN' };
    }

    const user = await User.findOne(query);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const before = user.toObject();
    await user.deleteOne();

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user.id,
      action: 'DELETE',
      resourceType: 'USER',
      resourceId: user._id,
      changes: { before },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.error('Delete user error:', error);
    next(error);
  }
};

export const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const query = {
      _id: req.params.id,
      tenantId: req.tenantId
    };

    // If user is ORG_ADMIN, exclude SUPER_ADMIN users
    if (req.user && req.user.role === 'ORG_ADMIN') {
      query.role = { $ne: 'SUPER_ADMIN' };
    }

    const user = await User.findOne(query);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent ORG_ADMIN from assigning SUPER_ADMIN role
    if (req.user && req.user.role === 'ORG_ADMIN' && role === 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to assign SUPER_ADMIN role'
      });
    }

    const before = user.toObject();
    user.role = role;
    await user.save();

    await createAuditLog({
      tenantId: req.tenantId,
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'USER',
      resourceId: user._id,
      changes: { before, after: user.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Update user role error:', error);
    next(error);
  }
};

// Get current user profile
export const getCurrentUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password -refreshToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Get current user profile error:', error);
    next(error);
  }
};

// Update current user profile
export const updateCurrentUserProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, email } = req.body;

    // Find the current user
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const before = user.toObject();

    // Update allowed fields
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (email !== undefined) user.email = email;

    await user.save();

    // Create audit log
    await createAuditLog({
      tenantId: user.tenantId,
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'USER',
      resourceId: user._id,
      changes: { before, after: user.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      data: user,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    logger.error('Update current user profile error:', error);
    next(error);
  }
};

// Change current user password
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Create audit log
    await createAuditLog({
      tenantId: user.tenantId,
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'USER',
      resourceId: user._id,
      changes: { passwordChanged: true },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Change password error:', error);
    next(error);
  }
};

