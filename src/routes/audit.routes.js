import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { resolveTenant, tenantScope } from '../middleware/tenant.middleware.js';
import { preventSuperAdminTenantWork } from '../middleware/rbac.middleware.js';
import * as auditController from '../controllers/audit.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(resolveTenant);
router.use(tenantScope);
// Prevent SUPER_ADMIN from accessing tenant audit logs (they should use system-wide audit)
router.use(preventSuperAdminTenantWork);

// Only ORG_ADMIN can access tenant audit logs
router.get('/', authorize('ORG_ADMIN'), auditController.getAuditLogs);
router.get('/:id', authorize('ORG_ADMIN'), auditController.getAuditLogById);
router.get('/user/:userId', authorize('ORG_ADMIN'), auditController.getUserAuditLogs);
router.get('/resource/:resourceType/:resourceId', authorize('ORG_ADMIN'), auditController.getResourceAuditLogs);

export default router;

