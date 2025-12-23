import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { resolveTenant, tenantScope } from '../middleware/tenant.middleware.js';
import { preventSuperAdminTenantWork, restrictToOwnProjects, canManageProjects } from '../middleware/rbac.middleware.js';
import * as projectController from '../controllers/project.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(resolveTenant);
router.use(tenantScope);
// Prevent SUPER_ADMIN from doing tenant work
router.use(preventSuperAdminTenantWork);

// Get projects - all authenticated users can view (filtered by role in controller)
router.get('/', projectController.getProjects);
router.get('/:id', projectController.getProjectById);

// Create project - ORG_ADMIN, PROJECT_MANAGER only
router.post('/', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), canManageProjects, projectController.createProject);

// Update project - ORG_ADMIN can update any, PROJECT_MANAGER only their own
router.put('/:id', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), restrictToOwnProjects, projectController.updateProject);

// Delete project - ORG_ADMIN only
router.delete('/:id', authorize('ORG_ADMIN'), projectController.deleteProject);

// Manage project members - ORG_ADMIN can manage any, PROJECT_MANAGER only their own
router.post('/:id/members', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), restrictToOwnProjects, projectController.addProjectMember);
router.delete('/:id/members/:userId', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), restrictToOwnProjects, projectController.removeProjectMember);

export default router;

