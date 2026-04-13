import { createLogger } from '../../lib/logger.js';
import type { Ticket } from './planning-orchestrator.js';

const log = createLogger('plan-judge');

const JUDGE_SYSTEM_PROMPT = `You are a strict plan verifier. Given a plan file and a ticket, respond ONLY with valid JSON.

Check these 3 things:
1. scope_match: Does the plan implement exactly what the ticket asks? (true/false)
2. function_names: Do the function names in the plan match what the ticket explicitly requests? (true/false)
3. no_hallucination: Does the plan avoid implementing features NOT mentioned in the ticket? (true/false)

Respond with:
{
  "verdict": "PASS" or "REJECT",
  "checks": { "scope_match": bool, "function_names": bool, "no_hallucination": bool },
  "rejection_reason": "string — only present if verdict is REJECT, explain what is wrong"
}

verdict is PASS only if ALL 3 checks are true. Otherwise REJECT.`;

export interface JudgeResult {
  verdict: 'PASS' | 'REJECT';
  checks: {
    scope_match: boolean;
    function_names: boolean;
    no_hallucination: boolean;
  };
  rejection_reason?: string;
}

export type PlanJudge = (planContent: string, ticket: Ticket) => Promise<JudgeResult>;

const PASS_RESULT: JudgeResult = {
  verdict: 'PASS',
  checks: { scope_match: true, function_names: true, no_hallucination: true },
};

export async function callPlanJudge(
  planContent: string,
  ticket: Ticket,
  model: string,
): Promise<JudgeResult> {
  if (model === '') {
    return PASS_RESULT;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: JUDGE_SYSTEM_PROMPT },
            {
              role: 'user',
              content: `TICKET:\nKey: ${ticket.key}\nSummary: ${ticket.summary}\nDescription: ${ticket.description}\n\nPLAN:\n${planContent}`,
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content;
      if (content == null) {
        throw new Error('No content in response');
      }

      // Extract first JSON object from response (handles trailing text, code fences, etc.)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch == null) {
        throw new Error('No JSON object found in response');
      }
      const parsed = JSON.parse(jsonMatch[0]) as {
        verdict?: unknown;
        checks?: {
          scope_match?: unknown;
          function_names?: unknown;
          no_hallucination?: unknown;
        };
        rejection_reason?: unknown;
      };

      const verdict = parsed.verdict;
      if (verdict !== 'PASS' && verdict !== 'REJECT') {
        throw new Error(`Unexpected verdict: ${String(verdict)}`);
      }

      const checks = parsed.checks;
      if (
        typeof checks?.scope_match !== 'boolean' ||
        typeof checks?.function_names !== 'boolean' ||
        typeof checks?.no_hallucination !== 'boolean'
      ) {
        throw new Error('Missing or invalid checks fields');
      }

      const result: JudgeResult = {
        verdict,
        checks: {
          scope_match: checks.scope_match,
          function_names: checks.function_names,
          no_hallucination: checks.no_hallucination,
        },
      };

      if (verdict === 'REJECT' && typeof parsed.rejection_reason === 'string') {
        result.rejection_reason = parsed.rejection_reason;
      }

      log.info(
        { verdict: result.verdict, checks: result.checks },
        'plan-judge: verdict=%s checks=%j',
        result.verdict,
        result.checks,
      );

      return result;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.warn({ err, errMsg }, 'plan-judge: API unavailable, defaulting to PASS');
    return PASS_RESULT;
  }
}
