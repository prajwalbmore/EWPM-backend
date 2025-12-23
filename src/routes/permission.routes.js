import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { resolveTenant } from '../middleware/tenant.middleware.js';
import * as permissionController from '../controllers/permission.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Apply tenant middleware for ORG_ADMIN
router.use((req, res, next) => {
  if (req.user.role === 'ORG_ADMIN') {
    return resolveTenant(req, res, next);
  }
  next();
});

// Get manageable users (SUPER_ADMIN: all, ORG_ADMIN: PROJECT_MANAGER and EMPLOYEE in their tenant)
router.get('/manageable', authorize('SUPER_ADMIN', 'ORG_ADMIN'), permissionController.getManageableUsers);

// Get permissions for a specific user
router.get('/user/:userId', authorize('SUPER_ADMIN', 'ORG_ADMIN'), permissionController.getUserPermissions);

// Update permissions for a user
router.put('/user/:userId', authorize('SUPER_ADMIN', 'ORG_ADMIN'), permissionController.updateUserPermissions);

// Reset user permissions to role defaults
router.post('/user/:userId/reset', authorize('SUPER_ADMIN', 'ORG_ADMIN'), permissionController.resetUserPermissions);

export default router;
