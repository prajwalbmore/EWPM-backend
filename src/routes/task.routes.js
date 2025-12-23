import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { resolveTenant, tenantScope } from '../middleware/tenant.middleware.js';
import { preventSuperAdminTenantWork, restrictToOwnTasks, canAssignTasks, canManageProjects } from '../middleware/rbac.middleware.js';
import * as taskController from '../controllers/task.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(resolveTenant);
router.use(tenantScope);
// Prevent SUPER_ADMIN from doing tenant work
router.use(preventSuperAdminTenantWork);

// Get tasks - filtered by role in controller (EMPLOYEE sees only assigned, others see all)
router.get('/', taskController.getTasks);
router.get('/:id', restrictToOwnTasks, taskController.getTaskById);

// Create task - ORG_ADMIN, PROJECT_MANAGER only
router.post('/', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), canManageProjects, taskController.createTask);

// Update task - ORG_ADMIN can update any, PROJECT_MANAGER can update in their projects, EMPLOYEE only assigned
router.put('/:id', restrictToOwnTasks, taskController.updateTask);

// Delete task - ORG_ADMIN, PROJECT_MANAGER only
router.delete('/:id', authorize('ORG_ADMIN', 'PROJECT_MANAGER'), taskController.deleteTask);

// Update task status - All roles can update (with restrictions in controller)
router.patch('/:id/status', restrictToOwnTasks, taskController.updateTaskStatus);

// Comments - All authenticated users can comment on accessible tasks
router.post('/:id/comments', restrictToOwnTasks, taskController.addComment);
router.put('/:id/comments/:commentId', restrictToOwnTasks, taskController.updateComment);
router.delete('/:id/comments/:commentId', restrictToOwnTasks, taskController.deleteComment);

export default router;

