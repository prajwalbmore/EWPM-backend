import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { resolveTenant } from '../middleware/tenant.middleware.js';
import * as tenantController from '../controllers/tenant.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Super admin only routes
router.get('/stats/global', authorize('SUPER_ADMIN'), tenantController.getGlobalStats);
router.post('/', authorize('SUPER_ADMIN'), tenantController.createTenant);
router.get('/', authorize('SUPER_ADMIN'), tenantController.getAllTenants);
router.get('/:id', authorize('SUPER_ADMIN'), tenantController.getTenantById);
router.put('/:id', authorize('SUPER_ADMIN'), tenantController.updateTenant);
router.delete('/:id', authorize('SUPER_ADMIN'), tenantController.deleteTenant);
router.post('/:id/suspend', authorize('SUPER_ADMIN'), tenantController.suspendTenant);
router.post('/:id/activate', authorize('SUPER_ADMIN'), tenantController.activateTenant);
router.get('/:id/stats', authorize('SUPER_ADMIN'), tenantController.getTenantStats);

// Org admin routes
router.get('/:id/settings', authorize('SUPER_ADMIN', 'ORG_ADMIN'), resolveTenant, tenantController.getTenantSettings);
router.put('/:id/settings', authorize('SUPER_ADMIN', 'ORG_ADMIN'), resolveTenant, tenantController.updateTenantSettings);

export default router;

