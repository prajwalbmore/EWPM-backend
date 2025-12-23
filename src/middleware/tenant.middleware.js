import logger from '../utils/logger.js';

/**
 * Multi-tenant middleware
 * Resolves tenant context from header, query, or subdomain
 * Prevents cross-tenant data access
 */
export const resolveTenant = async (req, res, next) => {
  try {
    // Priority: Header > Query > Subdomain
    let tenantId = req.headers['x-tenant-id'] 
      || req.query.tenantId 
      || req.headers.host?.split('.')[0]; // Subdomain-based tenant resolution

    // If user is authenticated, get tenant from user
    if (!tenantId && req.user) {
      tenantId = req.user.tenantId;
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    // Attach tenantId to request
    req.tenantId = tenantId;
    
    // Verify tenant exists and user has access (if authenticated)
    if (req.user) {
      // Additional tenant access validation can be added here
      if (req.user.tenantId !== tenantId && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this tenant'
        });
      }
    }

    next();
  } catch (error) {
    logger.error('Tenant resolution error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve tenant context'
    });
  }
};

/**
 * Middleware to add tenant filter to query
 * Ensures all queries are scoped to the tenant
 */
export const tenantScope = (req, res, next) => {
  if (req.tenantId) {
    // Add tenantId to query params for database queries
    req.queryFilter = { ...req.queryFilter, tenantId: req.tenantId };
  }
  next();
};

