import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { createTaskAndDispatch } from '../lib/create-task-and-dispatch.js';

export function createSummarizerTrigger(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'trigger/daily-summarizer',
      triggers: [{ cron: '0 8 * * 1-5' }],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ step }: { step: any }) => {
      const today = new Date().toISOString().slice(0, 10);
      return createTaskAndDispatch({
        inngest,
        step,
        archetypeSlug: 'daily-summarizer',
        externalId: `summary-${today}`,
        sourceSystem: 'cron',
      });
    },
  );
}
