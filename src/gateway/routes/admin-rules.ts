import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import { requireAdminKey } from '../middleware/admin-auth.js';
import {
  RuleArchetypeParamsSchema,
  RuleIdParamsSchema,
  CreateRuleBodySchema,
  UpdateRuleBodySchema,
} from '../validation/schemas.js';

const logger = createLogger('admin-rules');

export interface AdminRulesRouteOptions {
  prisma?: PrismaClient;
}

export function adminRulesRoutes(opts: AdminRulesRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();

  router.post(
    '/admin/tenants/:tenantId/employees/:archetypeId/rules',
    requireAdminKey,
    async (req, res) => {
      const paramsResult = RuleArchetypeParamsSchema.safeParse(req.params);
      if (!paramsResult.success) {
        res.status(400).json({ error: 'INVALID_REQUEST', issues: paramsResult.error.issues });
        return;
      }

      const bodyResult = CreateRuleBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        res.status(400).json({ error: 'INVALID_REQUEST', issues: bodyResult.error.issues });
        return;
      }

      const { tenantId, archetypeId } = paramsResult.data;

      try {
        const archetype = await prisma.archetype.findFirst({
          where: { id: archetypeId, tenant_id: tenantId },
          select: { id: true },
        });

        if (!archetype) {
          res
            .status(404)
            .json({ error: 'NOT_FOUND', message: 'Archetype not found for this tenant' });
          return;
        }

        const rule = await prisma.employeeRule.create({
          data: {
            tenant_id: tenantId,
            archetype_id: archetypeId,
            rule_text: bodyResult.data.rule_text,
            status: bodyResult.data.status,
            source: 'admin',
            confirmed_at: new Date(),
          },
        });

        res.status(201).json(rule);
      } catch (err) {
        logger.error({ err }, 'Failed to create employee rule');
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    },
  );

  router.patch(
    '/admin/tenants/:tenantId/employees/:archetypeId/rules/:ruleId',
    requireAdminKey,
    async (req, res) => {
      const paramsResult = RuleIdParamsSchema.safeParse(req.params);
      if (!paramsResult.success) {
        res.status(400).json({ error: 'INVALID_REQUEST', issues: paramsResult.error.issues });
        return;
      }

      const bodyResult = UpdateRuleBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        res.status(400).json({ error: 'INVALID_REQUEST', issues: bodyResult.error.issues });
        return;
      }

      const { tenantId, archetypeId, ruleId } = paramsResult.data;

      try {
        const archetype = await prisma.archetype.findFirst({
          where: { id: archetypeId, tenant_id: tenantId },
          select: { id: true },
        });

        if (!archetype) {
          res
            .status(404)
            .json({ error: 'NOT_FOUND', message: 'Archetype not found for this tenant' });
          return;
        }

        const data: { rule_text?: string; status?: string } = {};
        if (bodyResult.data.rule_text !== undefined) data.rule_text = bodyResult.data.rule_text;
        if (bodyResult.data.status !== undefined) data.status = bodyResult.data.status;

        const result = await prisma.employeeRule.updateMany({
          where: { id: ruleId, archetype_id: archetypeId, tenant_id: tenantId },
          data,
        });

        if (result.count === 0) {
          res.status(404).json({ error: 'NOT_FOUND' });
          return;
        }

        const updated = await prisma.employeeRule.findFirst({
          where: { id: ruleId, tenant_id: tenantId },
        });

        res.status(200).json(updated);
      } catch (err) {
        logger.error({ err }, 'Failed to update employee rule');
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    },
  );

  router.delete(
    '/admin/tenants/:tenantId/employees/:archetypeId/rules/:ruleId',
    requireAdminKey,
    async (req, res) => {
      const paramsResult = RuleIdParamsSchema.safeParse(req.params);
      if (!paramsResult.success) {
        res.status(400).json({ error: 'INVALID_REQUEST', issues: paramsResult.error.issues });
        return;
      }

      const { tenantId, archetypeId, ruleId } = paramsResult.data;

      try {
        const archetype = await prisma.archetype.findFirst({
          where: { id: archetypeId, tenant_id: tenantId },
          select: { id: true },
        });

        if (!archetype) {
          res
            .status(404)
            .json({ error: 'NOT_FOUND', message: 'Archetype not found for this tenant' });
          return;
        }

        const result = await prisma.employeeRule.deleteMany({
          where: { id: ruleId, archetype_id: archetypeId, tenant_id: tenantId },
        });

        if (result.count === 0) {
          res.status(404).json({ error: 'NOT_FOUND' });
          return;
        }

        res.status(204).send();
      } catch (err) {
        logger.error({ err }, 'Failed to delete employee rule');
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    },
  );

  return router;
}
