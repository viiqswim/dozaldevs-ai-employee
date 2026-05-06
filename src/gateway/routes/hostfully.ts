import { Router } from 'express';
import type { Request, Response } from 'express';
import pino from 'pino';
import { ZodError } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { InngestLike } from '../types.js';
import { parseHostfullyWebhook } from '../validation/schemas.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export interface HostfullyRouteOptions {
  inngestClient?: InngestLike;
  prisma?: PrismaClient;
}

export function hostfullyRoutes(opts: HostfullyRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();
  const inngest = opts.inngestClient;

  router.post('/webhooks/hostfully', async (req: Request, res: Response) => {
    let payload: ReturnType<typeof parseHostfullyWebhook>;
    try {
      payload = parseHostfullyWebhook(req.body);
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn({ issues: error.issues }, 'Invalid Hostfully webhook payload');
        res.status(400).json({ error: 'Invalid payload', details: error.issues });
        return;
      }
      throw error;
    }

    const { agency_uid, event_type, message_uid, thread_uid, lead_uid } = payload;
    logger.info({ agency_uid, event_type, message_uid, thread_uid }, 'Hostfully webhook received');

    if (event_type !== 'NEW_INBOX_MESSAGE') {
      logger.info({ event_type }, 'Ignoring non-message Hostfully event');
      res.json({ ok: true, ignored: true });
      return;
    }

    if (!lead_uid) {
      logger.warn({ message_uid }, 'NEW_INBOX_MESSAGE webhook missing lead_uid');
      res.status(400).json({ error: 'lead_uid is required for NEW_INBOX_MESSAGE events' });
      return;
    }

    const tenants = await prisma.tenant.findMany({
      select: { id: true, config: true },
    });

    const matchedTenant = tenants.find((t) => {
      const gm = (t.config as Record<string, unknown> | null)?.['guest_messaging'];
      return (gm as Record<string, unknown> | undefined)?.['hostfully_agency_uid'] === agency_uid;
    });

    if (!matchedTenant) {
      logger.warn({ agency_uid }, 'Hostfully webhook for unknown agency_uid — no matching tenant');
      res.json({ ok: true, tenant_not_found: true });
      return;
    }

    const tenant_id = matchedTenant.id;

    const archetype = await prisma.archetype.findUnique({
      where: {
        tenant_id_role_name: {
          tenant_id,
          role_name: 'guest-messaging',
        },
      },
    });

    if (!archetype) {
      logger.error(
        { tenant_id, role_name: 'guest-messaging' },
        'guest-messaging archetype not found for tenant',
      );
      res.json({ ok: true, archetype_not_found: true });
      return;
    }

    // ── Thread-level dedup: prevent echo-loop ghost tasks ───────────────────
    // Hostfully fires NEW_INBOX_MESSAGE for AI's own outgoing replies. Each echo
    // has a unique message_uid (bypassing message-level dedup), but shares the
    // same thread_uid. Block if an active task already exists for this thread.
    if (payload.thread_uid) {
      const activeTask = await prisma.task.findFirst({
        where: {
          tenant_id,
          archetype_id: archetype.id,
          status: { notIn: ['Done', 'Failed', 'Cancelled'] },
          raw_event: {
            path: ['thread_uid'],
            equals: payload.thread_uid,
          },
        },
        select: { id: true, status: true },
      });

      if (activeTask) {
        logger.info(
          {
            thread_uid: payload.thread_uid,
            existingTaskId: activeTask.id,
            existingStatus: activeTask.status,
          },
          'Active task already exists for thread — skipping duplicate webhook',
        );
        res.json({ ok: true, active_task_exists: true, existing_task_id: activeTask.id });
        return;
      }
    }

    let task: { id: string };
    try {
      task = await prisma.task.create({
        data: {
          archetype_id: archetype.id,
          external_id: `hostfully-msg-${payload.message_uid}`,
          source_system: 'hostfully',
          status: 'Ready',
          tenant_id,
          raw_event: {
            thread_uid: payload.thread_uid,
            message_uid: payload.message_uid,
            lead_uid: payload.lead_uid,
            property_uid: payload.property_uid,
          },
        },
        select: { id: true },
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        logger.info(
          { message_uid: payload.message_uid },
          'Duplicate Hostfully message — task already exists',
        );
        res.json({ ok: true, duplicate: true });
        return;
      }
      throw error;
    }

    if (inngest) {
      try {
        await inngest.send({
          name: 'employee/task.dispatched',
          data: { taskId: task.id, archetypeId: archetype.id },
          id: `hostfully-dispatch-hostfully-msg-${payload.message_uid}`,
        });
      } catch (error) {
        logger.error(
          { taskId: task.id, error },
          'Inngest send failed — task created but not dispatched',
        );
      }
    }

    res.json({ ok: true, task_id: task.id });
  });

  return router;
}
