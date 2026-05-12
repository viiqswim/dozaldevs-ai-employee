import { serve } from 'inngest/express';
import { Router } from 'express';
// import { PrismaClient } from '@prisma/client'; // Dead code: only used by engineering fns (deregistered)
import { createInngestClient } from './client.js';
// import { createLifecycleFunction } from '../../inngest/lifecycle.js'; // Deregistered: engineering employee on hold
// import { createRedispatchFunction } from '../../inngest/redispatch.js'; // Deregistered: engineering employee on hold
// import { createWatchdogFunction } from '../../inngest/watchdog.js'; // Deregistered: engineering employee on hold
import { createEmployeeLifecycleFunction } from '../../inngest/employee-lifecycle.js';
// import { createSummarizerTrigger } from '../../inngest/triggers/summarizer-trigger.js'; // Deregistered: use manual trigger via admin API
import { createInteractionHandlerFunction } from '../../inngest/interaction-handler.js';
// import { createFeedbackSummarizerTrigger } from '../../inngest/triggers/feedback-summarizer.js'; // Deregistered: replaced by event-driven rule-synthesizer
import { createRuleExtractorFunction } from '../../inngest/rule-extractor.js';
import { createRuleSynthesizerFunction } from '../../inngest/rule-synthesizer.js';
import { createReviewingWatchdogTrigger } from '../../inngest/triggers/reviewing-watchdog.js';
// import { createLearnedRulesExpiryTrigger } from '../../inngest/triggers/learned-rules-expiry.js'; // Deregistered: manual cleanup if needed
// import { createGuestMessagePollTrigger } from '../../inngest/triggers/guest-message-poll.js';
// import { createSlackClient } from '../../lib/slack-client.js'; // Dead code: only used by engineering fns (deregistered)
// import { getMachine, destroyMachine, createMachine } from '../../lib/fly-client.js'; // Dead code: only used by engineering fns (deregistered)

export function inngestServeRoutes(): Router {
  const router = Router();
  const inngest = createInngestClient();
  // const prisma = new PrismaClient(); // Dead code: only passed to engineering fns (deregistered)
  // const slackClient = createSlackClient({ // Dead code: only passed to engineering fns (deregistered)
  //   botToken: process.env.SLACK_BOT_TOKEN ?? '',
  //   defaultChannel: process.env.SLACK_CHANNEL_ID ?? '',
  // });

  // const flyClient = { getMachine, destroyMachine, createMachine }; // Dead code: only passed to watchdogFn (deregistered)

  // === DEREGISTERED FUNCTIONS ===
  // Only guest-messaging (universal lifecycle) and its learning pipeline remain active.
  // Engineering employee functions and summarizer trigger deregistered — source files preserved.
  // const lifecycleFn = createLifecycleFunction(inngest, prisma, slackClient); // Deregistered: engineering employee on hold
  // const redispatchFn = createRedispatchFunction(inngest, prisma, slackClient); // Deregistered: engineering employee on hold
  // const watchdogFn = createWatchdogFunction(inngest, prisma, flyClient, slackClient); // Deregistered: engineering employee on hold
  const employeeLifecycleFn = createEmployeeLifecycleFunction(inngest);
  // const summarizerTriggerFn = createSummarizerTrigger(inngest); // Deregistered: use manual trigger via admin API
  const interactionHandlerFn = createInteractionHandlerFunction(inngest);
  // const feedbackSummarizerFn = createFeedbackSummarizerTrigger(inngest); // Deregistered: replaced by event-driven rule-synthesizer
  const ruleExtractorFn = createRuleExtractorFunction(inngest);
  const ruleSynthesizerFn = createRuleSynthesizerFunction(inngest);
  const reviewingWatchdogFn = createReviewingWatchdogTrigger(inngest);
  // const learnedRulesExpiryFn = createLearnedRulesExpiryTrigger(inngest); // Deregistered: manual cleanup if needed — DELETE FROM learned_rules WHERE expires_at < NOW();
  // const guestMessagePollFn = createGuestMessagePollTrigger(inngest); // Disabled: cron tasks have incomplete raw_event data, causing broken approval cards

  const handler = serve({
    client: inngest,
    functions: [
      // lifecycleFn, // Deregistered: engineering employee on hold
      // redispatchFn, // Deregistered: engineering employee on hold
      // watchdogFn, // Deregistered: engineering employee on hold
      employeeLifecycleFn,
      // summarizerTriggerFn, // Deregistered: use manual trigger via admin API
      interactionHandlerFn,
      // feedbackSummarizerFn, // Deregistered: replaced by event-driven rule-synthesizer
      ruleExtractorFn,
      ruleSynthesizerFn,
      reviewingWatchdogFn,
      // learnedRulesExpiryFn, // Deregistered: manual cleanup if needed
      // guestMessagePollFn,
    ],
    serveOrigin: `http://localhost:${process.env.PORT ?? '7700'}`,
    servePath: '/api/inngest',
  });

  router.use(handler);

  return router;
}
