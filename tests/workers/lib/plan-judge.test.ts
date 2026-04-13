import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Ticket } from '../../../src/workers/lib/planning-orchestrator.js';
import { callPlanJudge } from '../../../src/workers/lib/plan-judge.js';

const MOCK_TICKET: Ticket = {
  key: 'TEST-99',
  summary: 'Add formatCurrency function',
  description: 'Add a formatCurrency(amount: number): string function using Intl.NumberFormat.',
};

const PASS_RESULT = {
  verdict: 'PASS' as const,
  checks: { scope_match: true, function_names: true, no_hallucination: true },
};

const REJECT_RESULT = {
  verdict: 'REJECT' as const,
  checks: { scope_match: false, function_names: true, no_hallucination: true },
  rejection_reason: 'Plan implements formatDate instead of formatCurrency',
};

function mockFetchResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

describe('callPlanJudge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns PASS immediately when model is empty string (gate disabled)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await callPlanJudge('any plan content', MOCK_TICKET, '');

    expect(result.verdict).toBe('PASS');
    expect(result.checks.scope_match).toBe(true);
    expect(result.checks.function_names).toBe(true);
    expect(result.checks.no_hallucination).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns PASS result when API returns PASS verdict', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse({
        choices: [{ message: { content: JSON.stringify(PASS_RESULT) } }],
      }) as unknown as Response,
    );

    const result = await callPlanJudge('good plan', MOCK_TICKET, 'anthropic/claude-haiku-4-5');

    expect(result.verdict).toBe('PASS');
    expect(result.checks.scope_match).toBe(true);
  });

  it('returns REJECT result with rejection_reason when API returns REJECT', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse({
        choices: [{ message: { content: JSON.stringify(REJECT_RESULT) } }],
      }) as unknown as Response,
    );

    const result = await callPlanJudge('bad plan', MOCK_TICKET, 'anthropic/claude-haiku-4-5');

    expect(result.verdict).toBe('REJECT');
    expect(result.rejection_reason).toBe('Plan implements formatDate instead of formatCurrency');
    expect(result.checks.scope_match).toBe(false);
  });

  it('returns PASS and logs warn when fetch throws (network error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failure'));

    const result = await callPlanJudge('any plan', MOCK_TICKET, 'anthropic/claude-haiku-4-5');

    expect(result.verdict).toBe('PASS');
    expect(result.checks.scope_match).toBe(true);
    // Warn is logged internally — just verify PASS is returned, not thrown
  });

  it('returns PASS when API response has trailing text after JSON object', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse({
        choices: [
          { message: { content: JSON.stringify(PASS_RESULT) + '\n\nSome explanation text.' } },
        ],
      }) as unknown as Response,
    );

    const result = await callPlanJudge('good plan', MOCK_TICKET, 'anthropic/claude-haiku-4-5');

    expect(result.verdict).toBe('PASS');
    expect(result.checks.scope_match).toBe(true);
  });

  it('returns PASS when fetch returns non-200 status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse({ error: 'Unauthorized' }, false, 401) as unknown as Response,
    );

    const result = await callPlanJudge('any plan', MOCK_TICKET, 'anthropic/claude-haiku-4-5');

    expect(result.verdict).toBe('PASS');
  });
});
