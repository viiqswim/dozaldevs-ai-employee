import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { PERMISSIONS } from '../../lib/auth/permissions.js';
import { deactivateUser } from '../services/deactivate-user.js';
import { sendError, sendSuccess } from '../lib/http-response.js';

export function adminUsersRoutes(): Router {
  const router = Router();

  router.patch(
    '/admin/users/:userId/deactivate',
    authMiddleware,
    requireAuth,
    requirePermission(PERMISSIONS.MANAGE_MEMBERS),
    async (req, res) => {
      const userId = req.params['userId'] as string;
      try {
        await deactivateUser(userId);
        sendSuccess(res, 200, { message: 'User deactivated' });
      } catch (err) {
        if (err instanceof Error && err.message === 'User not found') {
          sendError(res, 404, 'NOT_FOUND', 'User not found');
          return;
        }
        sendError(res, 500, 'INTERNAL_ERROR', 'Failed to deactivate user');
      }
    },
  );

  return router;
}
