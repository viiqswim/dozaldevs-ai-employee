import { serve } from 'inngest/express';
import { Router } from 'express';
import { createInngestClient } from './client.js';
import { createEmployeeLifecycleFunction } from '../../inngest/employee-lifecycle.js';
import { createInteractionHandlerFunction } from '../../inngest/interaction-handler.js';
import { createRuleExtractorFunction } from '../../inngest/rule-extractor.js';
import { createRuleSynthesizerFunction } from '../../inngest/rule-synthesizer.js';
import { createReviewingWatchdogTrigger } from '../../inngest/triggers/reviewing-watchdog.js';
import { createSlackTriggerHandlerFunction } from '../../inngest/slack-trigger-handler.js';
import { createSlackInputCollectorFunction } from '../../inngest/slack-input-collector.js';

// Inngest serve endpoint — registers the active Inngest functions on the Express
// gateway. Engineering-employee functions are deregistered (on hold), not wired up here.
export function inngestServeRoutes(): Router {
  const router = Router();
  const inngest = createInngestClient();

  const employeeLifecycleFn = createEmployeeLifecycleFunction(inngest);
  const interactionHandlerFn = createInteractionHandlerFunction(inngest);
  const ruleExtractorFn = createRuleExtractorFunction(inngest);
  const ruleSynthesizerFn = createRuleSynthesizerFunction(inngest);
  const reviewingWatchdogFn = createReviewingWatchdogTrigger(inngest);
  const slackTriggerHandlerFn = createSlackTriggerHandlerFunction(inngest);
  const slackInputCollectorFn = createSlackInputCollectorFunction(inngest);

  const handler = serve({
    client: inngest,
    functions: [
      employeeLifecycleFn,
      interactionHandlerFn,
      ruleExtractorFn,
      ruleSynthesizerFn,
      reviewingWatchdogFn,
      slackTriggerHandlerFn,
      slackInputCollectorFn,
    ],
    serveOrigin: process.env.GATEWAY_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? '7700'}`,
    servePath: '/api/inngest',
  });

  router.use(handler);

  return router;
}
