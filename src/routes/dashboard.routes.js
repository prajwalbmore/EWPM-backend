import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { resolveTenant, tenantScope } from '../middleware/tenant.middleware.js';
import * as dashboardController from '../controllers/dashboard.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Dashboard routes - accessible to all authenticated users
// Data is filtered by role in the controller
// For SUPER_ADMIN, we don't use tenant middleware
router.get('/', (req, res, next) => {
  if (req.user.role === 'SUPER_ADMIN') {
    // SUPER_ADMIN doesn't need tenant context
    return dashboardController.getDashboardData(req, res, next);
  }
  // Other roles need tenant context
  resolveTenant(req, res, () => {
    tenantScope(req, res, () => {
      dashboardController.getDashboardData(req, res, next);
    });
  });
});

router.get('/stats', (req, res, next) => {
  if (req.user.role === 'SUPER_ADMIN') {
    // SUPER_ADMIN doesn't need tenant context
    return dashboardController.getDashboardStats(req, res, next);
  }
  // Other roles need tenant context
  resolveTenant(req, res, () => {
    tenantScope(req, res, () => {
      dashboardController.getDashboardStats(req, res, next);
    });
  });
});

export default router;

