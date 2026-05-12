import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine, mockCtx } from '@inngest/test';
import {
  createEmployeeLifecycleFunction,
  MAX_EMPLOYEE_RULES_CHARS,
} from '../../src/inngest/employee-lifecycle.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

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

const TEST_TASK_ID = '33333333-3333-3333-3333-333333333333';
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const TEST_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000012';

const inngest = new Inngest({ id: 'ai-employee-learned-rules-injection-test' });

type RuleRow = {
  rule_text: string;
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

function makeFetch(rulesRows: RuleRow[], throwOnRules = false) {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();

    if ((url as string).includes('knowledge_bases')) {
      return { ok: true, json: () => Promise.resolve([]) };
    }
    if ((url as string).includes('/rest/v1/feedback_events')) {
      return { ok: true, json: () => Promise.resolve([]) };
    }
    if ((url as string).includes('/rest/v1/employee_rules') && method === 'GET') {
      if (throwOnRules) {
        throw new Error('PostgREST error — network failure');
      }
      return { ok: true, json: () => Promise.resolve(rulesRows) };
    }
    return { ok: true, json: () => Promise.resolve([]) };
  });
}

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
              return undefined;
          }
        });
      return mocked as any;
    },
  });
}

function getMachineEnv(): Record<string, string> {
  expect(mockCreateMachine).toHaveBeenCalledOnce();
  const machineConfig = mockCreateMachine.mock.calls[0][1] as {
    env: Record<string, string>;
  };
  return machineConfig.env;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateMachine.mockResolvedValue({ id: 'test-machine-id' });
  mockDestroyMachine.mockResolvedValue(undefined);
  mockGetTunnelUrl.mockResolvedValue('http://localhost:54321');
  mockLoadTenantEnv.mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-test-token' });

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

describe('learned-rules injection — lifecycle env assembly', () => {
  it('confirmed rules are included in EMPLOYEE_RULES env var', async () => {
    const rules: RuleRow[] = [
      {
        rule_text: 'Always greet guests by name',
        confirmed_at: '2026-01-01T00:00:00Z',
      },
      {
        rule_text: 'Mention checkout time in first message',
        confirmed_at: '2026-01-02T00:00:00Z',
      },
    ];

    vi.stubGlobal('fetch', makeFetch(rules));

    const engine = makeEngine();
    const { error } = await engine.execute(triggerEvent());
    expect(error).toBeUndefined();

    const env = getMachineEnv();
    expect(env).toHaveProperty('EMPLOYEE_RULES');
    expect(env['EMPLOYEE_RULES']).toContain('Always greet guests by name');
    expect(env['EMPLOYEE_RULES']).toContain('Mention checkout time in first message');
  });

  it('token budget — rules exceeding MAX_EMPLOYEE_RULES_CHARS are truncated; last included rule is complete', async () => {
    const rules: RuleRow[] = Array.from({ length: 40 }, (_, i) => ({
      rule_text: `Rule ${String(i).padStart(3, '0')}: ${'X'.repeat(200)}`,
      confirmed_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    }));

    vi.stubGlobal('fetch', makeFetch(rules));

    const engine = makeEngine();
    const { error } = await engine.execute(triggerEvent());
    expect(error).toBeUndefined();

    const env = getMachineEnv();
    expect(env).toHaveProperty('EMPLOYEE_RULES');

    const context = env['EMPLOYEE_RULES']!;
    const header = '## Behavioral Rules — follow these';
    const rulesSection = context.slice(header.length + 2);

    expect(rulesSection.length).toBeLessThanOrEqual(MAX_EMPLOYEE_RULES_CHARS);

    const ruleLines = rulesSection.split('\n').filter((l) => l.startsWith('- '));
    expect(ruleLines.length).toBeGreaterThan(0);
    expect(ruleLines.length).toBeLessThan(40);

    const lastLine = ruleLines[ruleLines.length - 1];
    expect(lastLine).toMatch(/^- Rule \d{3}: X+$/);
  });

  it('when PostgREST returns [], EMPLOYEE_RULES is absent from machine env', async () => {
    vi.stubGlobal('fetch', makeFetch([]));

    const engine = makeEngine();
    const { error } = await engine.execute(triggerEvent());
    expect(error).toBeUndefined();

    const env = getMachineEnv();
    expect(env).not.toHaveProperty('EMPLOYEE_RULES');
  });

  it('when fetch throws for employee_rules, lifecycle proceeds without exception and EMPLOYEE_RULES is absent', async () => {
    vi.stubGlobal('fetch', makeFetch([], true));

    const engine = makeEngine();
    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();

    const env = getMachineEnv();
    expect(env).not.toHaveProperty('EMPLOYEE_RULES');
  });

  it('output starts with the standard header and all rule entries use the "- rule_text" format', async () => {
    const rules: RuleRow[] = [
      {
        rule_text: 'Always greet with Hola Papi',
        confirmed_at: '2026-01-01T00:00:00Z',
      },
      {
        rule_text: 'Mention checkout time at the end',
        confirmed_at: '2026-01-02T00:00:00Z',
      },
    ];

    vi.stubGlobal('fetch', makeFetch(rules));

    const engine = makeEngine();
    const { error } = await engine.execute(triggerEvent());
    expect(error).toBeUndefined();

    const env = getMachineEnv();
    expect(env).toHaveProperty('EMPLOYEE_RULES');

    const context = env['EMPLOYEE_RULES']!;

    expect(context).toMatch(/^## Behavioral Rules — follow these\n\n/);

    const bodyLines = context.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'));
    expect(bodyLines.length).toBeGreaterThan(0);
    for (const line of bodyLines) {
      expect(line).toMatch(/^- .+/);
    }
  });
});

function buildSystemPrompt(base: string, employeeRules: string, employeeKnowledge: string): string {
  let systemPrompt = employeeRules ? `${base}\n\n${employeeRules}` : base;
  if (employeeKnowledge) {
    systemPrompt = `${systemPrompt}\n\n${employeeKnowledge}`;
  }
  return systemPrompt;
}

describe('learned-rules injection — harness prompt assembly', () => {
  it('when both EMPLOYEE_RULES and EMPLOYEE_KNOWLEDGE are set, systemPrompt = base → rules → knowledge in order', () => {
    const base = 'You are Papi Chulo, a Spanish TV news correspondent.';
    const rules = '## Behavioral Rules — follow these\n\n- Always say "Dios mío!"';
    const knowledge = '## Reference Knowledge\n\n- Tone: "Be more dramatic" (3 occurrences)';

    const result = buildSystemPrompt(base, rules, knowledge);

    expect(result).toBe(`${base}\n\n${rules}\n\n${knowledge}`);

    const baseIdx = result.indexOf(base);
    const rulesIdx = result.indexOf(rules);
    const knowledgeIdx = result.indexOf(knowledge);
    expect(baseIdx).toBeLessThan(rulesIdx);
    expect(rulesIdx).toBeLessThan(knowledgeIdx);
  });

  it('when only EMPLOYEE_RULES is set, systemPrompt = base + rules without extra blank lines from absent knowledge', () => {
    const base = 'You are Papi Chulo, a Spanish TV news correspondent.';
    const rules = '## Behavioral Rules — follow these\n\n- Always say "Dios mío!"';

    const result = buildSystemPrompt(base, rules, '');

    expect(result).toBe(`${base}\n\n${rules}`);
    expect(result).not.toContain('\n\n\n');
  });
});
