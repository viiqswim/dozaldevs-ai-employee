import type { FastifyInstance } from 'fastify';
import { serve } from 'inngest/fastify';
import { PrismaClient } from '@prisma/client';
import { createInngestClient } from './client.js';
import { createLifecycleFunction } from '../../inngest/lifecycle.js';
import { createRedispatchFunction } from '../../inngest/redispatch.js';
import { createWatchdogFunction } from '../../inngest/watchdog.js';
import { createSlackClient } from '../../lib/slack-client.js';
import { getMachine, destroyMachine, createMachine } from '../../lib/fly-client.js';

export async function inngestServeRoutes(app: FastifyInstance): Promise<void> {
  const inngest = createInngestClient();
  const prisma = new PrismaClient();
  const slackClient = createSlackClient({
    botToken: process.env.SLACK_BOT_TOKEN ?? '',
    defaultChannel: process.env.SLACK_CHANNEL_ID ?? '',
  });

  const flyClient = { getMachine, destroyMachine, createMachine };

  const lifecycleFn = createLifecycleFunction(inngest, prisma, slackClient);
  const redispatchFn = createRedispatchFunction(inngest, prisma, slackClient);
  const watchdogFn = createWatchdogFunction(inngest, prisma, flyClient, slackClient);

  const handler = serve({
    client: inngest,
    functions: [lifecycleFn, redispatchFn, watchdogFn],
  });

  app.route({
    method: ['GET', 'POST', 'PUT'],
    url: '/api/inngest',
    handler,
  });
}
