import jwt from 'jsonwebtoken';
import { getRedisClient } from '../config/redis.js';
import User from '../models/User.model.js';
import Tenant from '../models/Tenant.model.js';
import { createAuditLog } from '../services/audit.service.js';
import logger from '../utils/logger.js';

// Generate JWT tokens
const generateTokens = (user) => {
  const payload = {
    id: user._id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRY || '1d',
    issuer: process.env.JWT_ISSUER || 'ewpm-platform'
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d',
    issuer: process.env.JWT_ISSUER || 'ewpm-platform'
  });

  return { accessToken, refreshToken };
};

export const register = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, tenantId } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Verify tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant || !tenant.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or inactive tenant'
      });
    }

    // Create user
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      tenantId,
      role: 'EMPLOYEE' // Default role
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Save refresh token
    user.refreshToken = refreshToken;
    user.refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await user.save();

    // Create audit log
    await createAuditLog({
      tenantId: user.tenantId,
      userId: user._id,
      action: 'CREATE',
      resourceType: 'USER',
      resourceId: user._id,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user with password
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      await createAuditLog({
        tenantId: null,
        userId: null,
        action: 'LOGIN_FAILED',
        resourceType: 'USER',
        metadata: {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          reason: 'User not found'
        }
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await createAuditLog({
        tenantId: user.tenantId,
        userId: user._id,
        action: 'LOGIN_FAILED',
        resourceType: 'USER',
        metadata: {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          reason: 'Invalid password'
        }
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Update user login info
    user.lastLogin = new Date();
    user.lastLoginIP = req.ip;
    user.refreshToken = refreshToken;
    user.refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await user.save();

    // Create audit log
    await createAuditLog({
      tenantId: user.tenantId,
      userId: user._id,
      action: 'LOGIN',
      resourceType: 'USER',
      resourceId: user._id,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          tenantId: user.tenantId
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    // Find user
    const user = await User.findById(decoded.id).select('+refreshToken +refreshTokenExpiry');
    if (!user || user.refreshToken !== refreshToken || user.refreshTokenExpiry < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Generate new tokens
    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    user.refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await user.save();

    res.json({
      success: true,
      data: tokens
    });
  } catch (error) {
    logger.error('Refresh token error:', error);
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.substring(7);
    const redisClient = getRedisClient();

    // Blacklist token in Redis
    if (redisClient && token) {
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await redisClient.setEx(`blacklist:${token}`, ttl, 'true');
        }
      }
    }

    // Clear refresh token from user
    if (req.user) {
      const user = await User.findById(req.user.id);
      if (user) {
        user.refreshToken = null;
        user.refreshTokenExpiry = null;
        await user.save();

        await createAuditLog({
          tenantId: user.tenantId,
          userId: user._id,
          action: 'LOGOUT',
          resourceType: 'USER',
          resourceId: user._id,
          metadata: {
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          }
        });
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    next(error);
  }
};

export const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate('tenantId', 'name subdomain');
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
    logger.error('Get current user error:', error);
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select('+password');

    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    user.password = newPassword;
    await user.save();

    await createAuditLog({
      tenantId: user.tenantId,
      userId: user._id,
      action: 'UPDATE',
      resourceType: 'USER',
      resourceId: user._id,
      changes: {
        field: 'password'
      },
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

export const forgotPassword = async (req, res, next) => {
  // TODO: Implement forgot password functionality
  res.status(501).json({
    success: false,
    message: 'Forgot password not implemented yet'
  });
};

export const resetPassword = async (req, res, next) => {
  // TODO: Implement reset password functionality
  res.status(501).json({
    success: false,
    message: 'Reset password not implemented yet'
  });
};

