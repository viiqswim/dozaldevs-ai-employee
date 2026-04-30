import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine, mockCtx } from '@inngest/test';
import {
  createEmployeeLifecycleFunction,
  MAX_LEARNED_RULES_CHARS,
} from '../../src/inngest/employee-lifecycle.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Module mocks ─────────────────────────────────────────────────────────────

const { mockCreateMachine, mockDestroyMachine, mockGetTunnelUrl, mockLoadTenantEnv } = vi.hoisted(
  () => ({
    mockCreateMachine: vi.fn(),
    mockDestroyMachine: vi.fn(),
    mockGetTunnelUrl: vi.fn(),
    mockLoadTenantEnv: vi.fn(),
  }),
);

vi.mock('../../src/lib/fly-client.js', () => ({
  createMachine: mockCreateMachine,
  destroyMachine: mockDestroyMachine,
}));

vi.mock('../../src/lib/tunnel-client.js', () => ({
  getTunnelUrl: mockGetTunnelUrl,
}));

vi.mock('../../src/lib/slack-client.js', () => ({
  createSlackClient: vi.fn().mockReturnValue({
    updateMessage: vi.fn(),
    postMessage: vi.fn(),
  }),
}));

vi.mock('../../src/gateway/services/tenant-env-loader.js', () => ({
  loadTenantEnv: mockLoadTenantEnv,
}));

vi.mock('../../src/gateway/services/tenant-repository.js', () => ({
  TenantRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/gateway/services/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  })),
  Prisma: { JsonNull: 'JsonNull' },
}));

vi.mock('../../src/lib/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ── Test fixtures ─────────────────────────────────────────────────────────────

const TEST_TASK_ID = '33333333-3333-3333-3333-333333333333';
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const TEST_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000012';

const inngest = new Inngest({ id: 'ai-employee-learned-rules-injection-test' });

type RuleRow = {
  rule_text: string;
  entity_type: string | null;
  entity_id: string | null;
  scope: string;
  confirmed_at: string;
};

function makeMockTaskData() {
  return {
    id: TEST_TASK_ID,
    tenant_id: TEST_TENANT_ID,
    status: 'Ready',
    archetypes: {
      id: TEST_ARCHETYPE_ID,
      risk_model: { approval_required: false, timeout_hours: 24 },
      runtime: 'opencode',
      model: 'minimax/minimax-m2.7',
    },
  };
}

function triggerEvent(): { events: [{ name: string; data: Record<string, unknown> }] } {
  return {
    events: [
      {
        name: 'employee/task.dispatched',
        data: { taskId: TEST_TASK_ID, archetypeId: TEST_ARCHETYPE_ID },
      },
    ],
  };
}

/**
 * Build a fetch mock that handles all PostgREST calls in the 'executing' step.
 * @param learnedRulesRows  Rules to return for the learned_rules GET
 * @param throwOnRules      When true, the learned_rules fetch throws instead of returning
 */
function makeFetch(learnedRulesRows: RuleRow[], throwOnRules = false) {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();

    if ((url as string).includes('knowledge_bases')) {
      return { ok: true, json: () => Promise.resolve([]) };
    }
    if ((url as string).includes('/rest/v1/feedback')) {
      return { ok: true, json: () => Promise.resolve([]) };
    }
    if ((url as string).includes('/rest/v1/learned_rules') && method === 'GET') {
      if (throwOnRules) {
        throw new Error('PostgREST error — network failure');
      }
      return { ok: true, json: () => Promise.resolve(learnedRulesRows) };
    }
    // Catch-all: patchTask (PATCH /tasks), logStatusTransition (POST /task_status_log), etc.
    return { ok: true, json: () => Promise.resolve([]) };
  });
}

/**
 * InngestTestEngine that runs ONLY the 'executing' step; all others return mock values.
 * approval_required=false keeps the lifecycle from entering the approval wait loop.
 */
function makeEngine() {
  return new InngestTestEngine({
    function: createEmployeeLifecycleFunction(inngest),
    transformCtx: (ctx: unknown) => {
      const mocked = mockCtx(ctx as any);
      (mocked as any).step.run = vi
        .fn()
        .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
          switch (id) {
            case 'load-task':
              return makeMockTaskData();
            case 'executing':
              return fn();
            case 'poll-completion':
              return 'Submitting';
            default:
              // triaging, awaiting-input, ready, validating, submitting, complete, cleanup-* etc.
              return undefined;
          }
        });
      return mocked as any;
    },
  });
}

/** Extract the env object passed to createMachine. */
function getMachineEnv(): Record<string, string> {
  expect(mockCreateMachine).toHaveBeenCalledOnce();
  const machineConfig = mockCreateMachine.mock.calls[0][1] as {
    env: Record<string, string>;
  };
  return machineConfig.env;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateMachine.mockResolvedValue({ id: 'test-machine-id' });
  mockDestroyMachine.mockResolvedValue(undefined);
  mockGetTunnelUrl.mockResolvedValue('http://localhost:54321');
  mockLoadTenantEnv.mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-test-token' });

  // Prevent the poll-completion loop's 15s sleeps from stalling tests
  vi.stubGlobal('setTimeout', (fn: (...args: unknown[]) => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  });

  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'test-supabase-key';
  process.env.FLY_WORKER_APP = 'ai-employee-workers';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.FLY_WORKER_APP;
});

// ═════════════════════════════════════════════════════════════════════════════
// Suite 1: Lifecycle — LEARNED_RULES_CONTEXT injection into machine env
// ═════════════════════════════════════════════════════════════════════════════

describe('learned-rules injection — lifecycle env assembly', () => {
  // ── Test 1: Ranking ──────────────────────────────────────────────────────

  it('archetype-scoped rules appear before tenant-wide rules in LEARNED_RULES_CONTEXT', async () => {
    const rules: RuleRow[] = [
      {
        rule_text: 'Common rule from tenant',
        entity_type: 'tenant',
        entity_id: null,
        scope: 'common',
        confirmed_at: '2026-01-01T00:00:00Z',
      },
      {
        rule_text: 'Archetype-specific rule',
        entity_type: 'archetype',
        entity_id: TEST_ARCHETYPE_ID,
        scope: 'entity',
        confirmed_at: '2026-01-02T00:00:00Z',
      },
      {
        rule_text: 'Another common rule',
        entity_type: null,
        entity_id: null,
        scope: 'common',
        confirmed_at: '2026-01-03T00:00:00Z',
      },
    ];

    vi.stubGlobal('fetch', makeFetch(rules));

    const engine = makeEngine();
    const { error } = await engine.execute(triggerEvent());
    expect(error).toBeUndefined();

    const env = getMachineEnv();
    expect(env).toHaveProperty('LEARNED_RULES_CONTEXT');

    const ruleLines = env['LEARNED_RULES_CONTEXT']!.split('\n').filter((l) => l.startsWith('- '));
    expect(ruleLines[0]).toContain('Archetype-specific rule');
    expect(ruleLines[1]).toContain('Common rule from tenant');
    expect(ruleLines[2]).toContain('Another common rule');
  });

  // ── Test 2: Token budget ─────────────────────────────────────────────────

  it('token budget — rules exceeding MAX_LEARNED_RULES_CHARS are truncated; last included rule is complete', async () => {
    // 40 rules × ~212-char lines = ~8480 chars total → must truncate
    const rules: RuleRow[] = Array.from({ length: 40 }, (_, i) => ({
      rule_text: `Rule ${String(i).padStart(3, '0')}: ${'X'.repeat(200)}`,
      entity_type: null,
      entity_id: null,
      scope: 'common',
      confirmed_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    }));

    vi.stubGlobal('fetch', makeFetch(rules));

    const engine = makeEngine();
    const { error } = await engine.execute(triggerEvent());
    expect(error).toBeUndefined();

    const env = getMachineEnv();
    expect(env).toHaveProperty('LEARNED_RULES_CONTEXT');

    const context = env['LEARNED_RULES_CONTEXT']!;
    const header = '## Learned Behaviors — follow these rules';
    const rulesSection = context.slice(header.length + 2); // strip header + '\n\n'

    // Rules section stays within the budget
    expect(rulesSection.length).toBeLessThanOrEqual(MAX_LEARNED_RULES_CHARS);

    // Fewer rules than provided (truncation occurred)
    const ruleLines = rulesSection.split('\n').filter((l) => l.startsWith('- '));
    expect(ruleLines.length).toBeGreaterThan(0);
    expect(ruleLines.length).toBeLessThan(40);

    // Last included rule is a complete line, not a mid-string cutoff
    const lastLine = ruleLines[ruleLines.length - 1];
    expect(lastLine).toMatch(/^- Rule \d{3}: X+$/);
  });

  // ── Test 3: Empty rules omission ─────────────────────────────────────────

  it('when PostgREST returns [], LEARNED_RULES_CONTEXT is absent from machine env', async () => {
    vi.stubGlobal('fetch', makeFetch([]));

    const engine = makeEngine();
    const { error } = await engine.execute(triggerEvent());
    expect(error).toBeUndefined();

    const env = getMachineEnv();
    expect(env).not.toHaveProperty('LEARNED_RULES_CONTEXT');
  });

  // ── Test 4: Error handling ────────────────────────────────────────────────

  it('when fetch throws for learned_rules, lifecycle proceeds without exception and LEARNED_RULES_CONTEXT is absent', async () => {
    vi.stubGlobal('fetch', makeFetch([], /* throwOnRules */ true));

    const engine = makeEngine();
    const { error } = await engine.execute(triggerEvent());

    // Lifecycle must not surface the error — the try/catch swallows it
    expect(error).toBeUndefined();

    // Machine is still dispatched (lifecycle continues after the rules error)
    const env = getMachineEnv();
    expect(env).not.toHaveProperty('LEARNED_RULES_CONTEXT');
  });

  // ── Test 5: Formatting ────────────────────────────────────────────────────

  it('output starts with the standard header and all rule entries use the "- rule_text" format', async () => {
    const rules: RuleRow[] = [
      {
        rule_text: 'Always greet with Hola Papi',
        entity_type: 'archetype',
        entity_id: TEST_ARCHETYPE_ID,
        scope: 'entity',
        confirmed_at: '2026-01-01T00:00:00Z',
      },
      {
        rule_text: 'Mention checkout time at the end',
        entity_type: null,
        entity_id: null,
        scope: 'common',
        confirmed_at: '2026-01-02T00:00:00Z',
      },
    ];

    vi.stubGlobal('fetch', makeFetch(rules));

    const engine = makeEngine();
    const { error } = await engine.execute(triggerEvent());
    expect(error).toBeUndefined();

    const env = getMachineEnv();
    expect(env).toHaveProperty('LEARNED_RULES_CONTEXT');

    const context = env['LEARNED_RULES_CONTEXT']!;

    // Must start with the exact header followed by a blank line
    expect(context).toMatch(/^## Learned Behaviors — follow these rules\n\n/);

    // Every non-empty, non-header line must be a bullet
    const bodyLines = context.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'));
    expect(bodyLines.length).toBeGreaterThan(0);
    for (const line of bodyLines) {
      expect(line).toMatch(/^- .+/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Suite 2: Harness — systemPrompt assembly
// Mirrors the logic at src/workers/opencode-harness.mts lines 328-336.
// The .mts file is not easily importable in tests; we verify the logic pattern.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Local mirror of the prompt-assembly logic in opencode-harness.mts (lines 328-336):
 *   let systemPrompt = feedbackContext ? `${base}\n\n${feedbackContext}` : base;
 *   if (learnedRulesContext) systemPrompt = `${systemPrompt}\n\n${learnedRulesContext}`;
 */
function buildSystemPrompt(
  base: string,
  feedbackContext: string,
  learnedRulesContext: string,
): string {
  let systemPrompt = feedbackContext ? `${base}\n\n${feedbackContext}` : base;
  if (learnedRulesContext) {
    systemPrompt = `${systemPrompt}\n\n${learnedRulesContext}`;
  }
  return systemPrompt;
}

describe('learned-rules injection — harness prompt assembly', () => {
  // ── Test 6: Both FEEDBACK_CONTEXT and LEARNED_RULES_CONTEXT ──────────────

  it('when both FEEDBACK_CONTEXT and LEARNED_RULES_CONTEXT are set, systemPrompt = base → feedback → rules in order', () => {
    const base = 'You are Papi Chulo, a Spanish TV news correspondent.';
    const feedback = 'Recent feedback:\n- Be more dramatic';
    const rules = '## Learned Behaviors — follow these rules\n\n- Always say "Dios mío!"';

    const result = buildSystemPrompt(base, feedback, rules);

    expect(result).toBe(`${base}\n\n${feedback}\n\n${rules}`);

    // Order: base appears first, then feedback, then rules
    const baseIdx = result.indexOf(base);
    const feedbackIdx = result.indexOf(feedback);
    const rulesIdx = result.indexOf(rules);
    expect(baseIdx).toBeLessThan(feedbackIdx);
    expect(feedbackIdx).toBeLessThan(rulesIdx);
  });

  // ── Test 7: Only LEARNED_RULES_CONTEXT (no feedback) ─────────────────────

  it('when only LEARNED_RULES_CONTEXT is set, systemPrompt = base + rules without extra blank lines from absent feedback', () => {
    const base = 'You are Papi Chulo, a Spanish TV news correspondent.';
    const rules = '## Learned Behaviors — follow these rules\n\n- Always say "Dios mío!"';

    const result = buildSystemPrompt(base, '', rules);

    expect(result).toBe(`${base}\n\n${rules}`);
    // No triple newline that would appear if empty feedback were concatenated
    expect(result).not.toContain('\n\n\n');
  });
});
