import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { resolveTenant, tenantScope } from '../middleware/tenant.middleware.js';
import * as userController from '../controllers/user.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(resolveTenant);
router.use(tenantScope);

router.get('/', userController.getUsers);
router.get('/:id', userController.getUserById);
router.post('/', authorize('SUPER_ADMIN', 'ORG_ADMIN'), userController.createUser);
router.put('/:id', authorize('SUPER_ADMIN', 'ORG_ADMIN'), userController.updateUser);
router.delete('/:id', authorize('SUPER_ADMIN', 'ORG_ADMIN'), userController.deleteUser);
router.put('/:id/role', authorize('SUPER_ADMIN', 'ORG_ADMIN'), userController.updateUserRole);

// Profile routes (current user only)
router.get('/profile/me', userController.getCurrentUserProfile);
router.put('/profile/me', userController.updateCurrentUserProfile);
router.put('/profile/change-password', userController.changePassword);

export default router;

