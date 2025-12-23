import Tenant from '../models/Tenant.model.js';
import User from '../models/User.model.js';
import mongoose from 'mongoose';
import { createAuditLog } from '../services/audit.service.js';
import logger from '../utils/logger.js';

export const createTenant = async (req, res, next) => {
  try {
    const {
      name,
      subdomain,
      domain,
      plan = 'FREE',
      orgAdminEmail,
      orgAdminPassword,
      orgAdminFirstName,
      orgAdminLastName,
      settings,
      subscription
    } = req.body;

    // Validate required fields
    if (!name || !subdomain) {
      return res.status(400).json({
        success: false,
        message: 'Tenant name and subdomain are required'
      });
    }

    // Check if subdomain already exists
    const existingTenant = await Tenant.findOne({ subdomain: subdomain.toLowerCase() });
    if (existingTenant) {
      return res.status(400).json({
        success: false,
        message: 'Subdomain already exists'
      });
    }

    // Create tenant
    const tenantData = {
      name,
      subdomain: subdomain.toLowerCase(),
      domain: domain || undefined,
      isActive: true,
      settings: settings || {
        timezone: 'UTC',
        dateFormat: 'YYYY-MM-DD',
        maxUsers: 100,
        features: {
          realTimeCollaboration: true,
          advancedReporting: plan === 'ENTERPRISE' || plan === 'PRO',
          apiAccess: plan === 'ENTERPRISE'
        }
      },
      subscription: subscription || {
        plan,
        startDate: new Date(),
        endDate: plan === 'FREE' ? null : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year for paid plans
      }
    };

    const tenant = await Tenant.create(tenantData);

    // Create Org Admin user if provided
    let orgAdmin = null;
    if (orgAdminEmail && orgAdminPassword && orgAdminFirstName && orgAdminLastName) {
      // Check if email already exists
      const existingUser = await User.findOne({ email: orgAdminEmail });
      if (existingUser) {
        // Delete tenant if user creation fails
        await tenant.deleteOne();
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }

      orgAdmin = await User.create({
        email: orgAdminEmail,
        password: orgAdminPassword,
        firstName: orgAdminFirstName,
        lastName: orgAdminLastName,
        role: 'ORG_ADMIN',
        tenantId: tenant._id,
        isActive: true
      });

      logger.info(`Created Org Admin for tenant ${tenant.name}: ${orgAdminEmail}`);
    }

    await createAuditLog({
      tenantId: tenant._id,
      userId: req.user.id,
      action: 'CREATE',
      resourceType: 'TENANT',
      resourceId: tenant._id,
      changes: { after: tenant.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        note: 'Tenant created with Org Admin'
      }
    });

    res.status(201).json({
      success: true,
      data: {
        tenant,
        orgAdmin: orgAdmin ? {
          id: orgAdmin._id,
          email: orgAdmin.email,
          firstName: orgAdmin.firstName,
          lastName: orgAdmin.lastName
        } : null
      }
    });
  } catch (error) {
    logger.error('Create tenant error:', error);
    next(error);
  }
};

export const getAllTenants = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, isActive, plan } = req.query;
    const query = {};

    if (isActive !== undefined && isActive !== '') {
      query.isActive = isActive === 'true' || isActive === true;
    }

    if (plan && plan.trim() !== '') {
      query['subscription.plan'] = plan;
    }

    const tenants = await Tenant.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Tenant.countDocuments(query);

    // Get user counts for each tenant
    const tenantsWithStats = await Promise.all(
      tenants.map(async (tenant) => {
        const userCount = await User.countDocuments({ tenantId: tenant._id });
        const projectCount = await mongoose.model('Project').countDocuments({ tenantId: tenant._id });
        return {
          ...tenant.toObject(),
          stats: {
            userCount,
            projectCount
          }
        };
      })
    );

    res.json({
      success: true,
      data: tenantsWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get all tenants error:', error);
    next(error);
  }
};

export const getTenantById = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    res.json({
      success: true,
      data: tenant
    });
  } catch (error) {
    logger.error('Get tenant by ID error:', error);
    next(error);
  }
};

export const updateTenant = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const before = tenant.toObject();
    Object.assign(tenant, req.body);
    await tenant.save();

    await createAuditLog({
      tenantId: tenant._id,
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'TENANT',
      resourceId: tenant._id,
      changes: { before, after: tenant.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      data: tenant
    });
  } catch (error) {
    logger.error('Update tenant error:', error);
    next(error);
  }
};

export const deleteTenant = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    await tenant.deleteOne();

    await createAuditLog({
      tenantId: tenant._id,
      userId: req.user.id,
      action: 'DELETE',
      resourceType: 'TENANT',
      resourceId: tenant._id,
      changes: { before: tenant.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      message: 'Tenant deleted successfully'
    });
  } catch (error) {
    logger.error('Delete tenant error:', error);
    next(error);
  }
};

export const getTenantSettings = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    res.json({
      success: true,
      data: {
        settings: tenant.settings,
        subscription: tenant.subscription
      }
    });
  } catch (error) {
    logger.error('Get tenant settings error:', error);
    next(error);
  }
};

export const updateTenantSettings = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const before = tenant.toObject();
    if (req.body.settings) {
      tenant.settings = { ...tenant.settings, ...req.body.settings };
    }
    if (req.body.subscription) {
      tenant.subscription = { ...tenant.subscription, ...req.body.subscription };
    }
    await tenant.save();

    await createAuditLog({
      tenantId: tenant._id,
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'TENANT',
      resourceId: tenant._id,
      changes: { before, after: tenant.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      data: tenant
    });
  } catch (error) {
    logger.error('Update tenant settings error:', error);
    next(error);
  }
};

export const suspendTenant = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const before = tenant.toObject();
    tenant.isActive = false;
    await tenant.save();

    await createAuditLog({
      tenantId: tenant._id,
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'TENANT',
      resourceId: tenant._id,
      changes: { before, after: tenant.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        note: 'Tenant suspended'
      }
    });

    res.json({
      success: true,
      message: 'Tenant suspended successfully',
      data: tenant
    });
  } catch (error) {
    logger.error('Suspend tenant error:', error);
    next(error);
  }
};

export const activateTenant = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const before = tenant.toObject();
    tenant.isActive = true;
    await tenant.save();

    await createAuditLog({
      tenantId: tenant._id,
      userId: req.user.id,
      action: 'UPDATE',
      resourceType: 'TENANT',
      resourceId: tenant._id,
      changes: { before, after: tenant.toObject() },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        note: 'Tenant activated'
      }
    });

    res.json({
      success: true,
      message: 'Tenant activated successfully',
      data: tenant
    });
  } catch (error) {
    logger.error('Activate tenant error:', error);
    next(error);
  }
};

export const getTenantStats = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const Project = mongoose.model('Project');
    const Task = mongoose.model('Task');

    const stats = {
      users: await User.countDocuments({ tenantId: tenant._id }),
      activeUsers: await User.countDocuments({ tenantId: tenant._id, isActive: true }),
      projects: await Project.countDocuments({ tenantId: tenant._id }),
      activeProjects: await Project.countDocuments({ tenantId: tenant._id, status: 'IN_PROGRESS' }),
      tasks: await Task.countDocuments({ tenantId: tenant._id }),
      completedTasks: await Task.countDocuments({ tenantId: tenant._id, status: 'DONE' })
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Get tenant stats error:', error);
    next(error);
  }
};

export const getGlobalStats = async (req, res, next) => {
  try {
    const Project = mongoose.model('Project');
    const Task = mongoose.model('Task');

    const stats = {
      totalTenants: await Tenant.countDocuments(),
      activeTenants: await Tenant.countDocuments({ isActive: true }),
      totalUsers: await User.countDocuments({ role: { $ne: "SUPER_ADMIN" } }),
      totalProjects: await Project.countDocuments(),
      totalTasks: await Task.countDocuments(),
      completedTasks: await Task.countDocuments({ status: 'DONE' }),
      tenantsByPlan: await Tenant.aggregate([
        {
          $group: {
            _id: '$subscription.plan',
            count: { $sum: 1 }
          }
        }
      ])
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Get global stats error:', error);
    next(error);
  }
};

