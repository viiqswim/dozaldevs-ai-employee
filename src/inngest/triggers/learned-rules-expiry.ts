import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('learned-rules-expiry');

interface LearnedRuleRow {
  id: string;
}

export function createLearnedRulesExpiryTrigger(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'trigger/learned-rules-expiry',
      triggers: [{ cron: '0 2 * * *' }],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ step }: { step: any }) => {
      const supabaseUrl = process.env.SUPABASE_URL ?? '';
      const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? '';

      if (!supabaseUrl || !supabaseKey) {
        log.warn('SUPABASE_URL or SUPABASE_SECRET_KEY not set — skipping learned rules expiry');
        return;
      }

      const headers = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      };

      const expiredRules = await step.run('find-expired-rules', async () => {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const res = await fetch(
          `${supabaseUrl}/rest/v1/learned_rules?status=eq.proposed&confirmed_at=is.null&created_at=lt.${cutoff}&select=id`,
          { headers },
        );
        return (await res.json()) as LearnedRuleRow[];
      });

      for (const rule of expiredRules) {
        await step.run(`expire-rules-${rule.id}`, async () => {
          await fetch(`${supabaseUrl}/rest/v1/learned_rules?id=eq.${rule.id}`, {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({ status: 'expired' }),
          });
        });
      }

      log.info({ expiredCount: expiredRules.length }, 'Learned rules expiry complete');
    },
  );
}
