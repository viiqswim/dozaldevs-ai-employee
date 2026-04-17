import { serve } from 'inngest/express';
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createInngestClient } from './client.js';
import { createLifecycleFunction } from '../../inngest/lifecycle.js';
import { createRedispatchFunction } from '../../inngest/redispatch.js';
import { createWatchdogFunction } from '../../inngest/watchdog.js';
import { createEmployeeLifecycleFunction } from '../../inngest/employee-lifecycle.js';
import { createSummarizerTrigger } from '../../inngest/triggers/summarizer-trigger.js';
import { createFeedbackHandlerFunction } from '../../inngest/feedback-handler.js';
import { createMentionHandlerFunction } from '../../inngest/mention-handler.js';
import { createFeedbackResponderFunction } from '../../inngest/feedback-responder.js';
import { createFeedbackSummarizerTrigger } from '../../inngest/triggers/feedback-summarizer.js';
import { createSlackClient } from '../../lib/slack-client.js';
import { getMachine, destroyMachine, createMachine } from '../../lib/fly-client.js';

export function inngestServeRoutes(): Router {
  const router = Router();
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
  const employeeLifecycleFn = createEmployeeLifecycleFunction(inngest);
  const summarizerTriggerFn = createSummarizerTrigger(inngest);
  const feedbackHandlerFn = createFeedbackHandlerFunction(inngest);
  const mentionHandlerFn = createMentionHandlerFunction(inngest);
  const feedbackResponderFn = createFeedbackResponderFunction(inngest);
  const feedbackSummarizerFn = createFeedbackSummarizerTrigger(inngest);

  const handler = serve({
    client: inngest,
    functions: [
      lifecycleFn,
      redispatchFn,
      watchdogFn,
      employeeLifecycleFn,
      summarizerTriggerFn,
      feedbackHandlerFn,
      mentionHandlerFn,
      feedbackResponderFn,
      feedbackSummarizerFn,
    ],
  });

  router.use(handler);

  return router;
}
