import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { resolveTenant, tenantScope } from '../middleware/tenant.middleware.js';
import { preventSuperAdminTenantWork } from '../middleware/rbac.middleware.js';
import * as reportController from '../controllers/report.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(resolveTenant);
router.use(tenantScope);
// Prevent SUPER_ADMIN from accessing tenant reports
router.use(preventSuperAdminTenantWork);

// ORG_ADMIN and PROJECT_MANAGER can access reports
router.get('/productivity', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), reportController.getProductivityReport);
router.get('/project-completion', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), reportController.getProjectCompletionReport);
router.get('/time-tracking', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), reportController.getTimeTrackingReport);
router.get('/user-activity', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), reportController.getUserActivityReport);
router.get('/task-status', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), reportController.getTaskStatusReport);
router.get('/budget', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), reportController.getBudgetReport);
router.get('/task-trends', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), reportController.getTaskTrendsReport);
router.get('/priority', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), reportController.getPriorityReport);
router.get('/team-utilization', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), reportController.getTeamUtilizationReport);
router.get('/export/:type', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), reportController.exportReport);

export default router;

