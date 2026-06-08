import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Inngest } from 'inngest';

const {
  mockPatchTask,
  mockLogStatusTransition,
  mockRunNoApprovalPath,
  mockRunOverrideCardPath,
  mockRunReviewingPath,
} = vi.hoisted(() => ({
  mockPatchTask: vi.fn().mockResolvedValue(undefined),
  mockLogStatusTransition: vi.fn().mockResolvedValue(undefined),
  mockRunNoApprovalPath: vi.fn().mockResolvedValue(undefined),
  mockRunOverrideCardPath: vi.fn().mockResolvedValue(false),
  mockRunReviewingPath: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/inngest/lib/lifecycle-helpers.js', () => ({
  patchTask: mockPatchTask,
  logStatusTransition: mockLogStatusTransition,
}));

vi.mock('../../../../src/inngest/lifecycle/steps/no-approval-path.js', () => ({
  runNoApprovalPath: mockRunNoApprovalPath,
}));

vi.mock('../../../../src/inngest/lifecycle/steps/override-card.js', () => ({
  runOverrideCardPath: mockRunOverrideCardPath,
}));

vi.mock('../../../../src/inngest/lifecycle/steps/reviewing-path.js', () => ({
  runReviewingPath: mockRunReviewingPath,
}));

vi.mock('../../../../src/lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { runValidateAndSubmit } from '../../../../src/inngest/lifecycle/steps/validate-and-submit.js';
import type { ValidateContext } from '../../../../src/inngest/lifecycle/steps/validate-and-submit.js';

const TASK_ID = 'aaaa2002-0000-0000-0000-000000000000';
const ARCHETYPE_ID = 'arch2002-0000-0000-0000-000000000000';
const TENANT_ID = '00000000-0000-0000-0000-000000000002';
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_KEY = 'test-key';
const MACHINE_ID = 'docker_test-machine-validate';
const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

function makeCtx(overrides: Partial<ValidateContext> = {}): ValidateContext {
  const inngest = new Inngest({ id: 'test-validate-and-submit' });
  return {
    taskId: TASK_ID,
    archetypeId: ARCHETYPE_ID,
    tenantId: TENANT_ID,
    runId: 'run-validate-001',
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    headers: HEADERS,
    taskData: {},
    archetype: { role_name: 'Test Employee' },
    approvalRequired: true,
    machineId: MACHINE_ID,
    timeoutHours: 24,
    notifyMsgRef: { ts: 'ts-notify-001', channel: 'C-NOTIFY' },
    notifyBlocks: vi.fn().mockReturnValue([]),
    notifyStateBlocks: vi.fn().mockReturnValue([]),
    inngest,
    ...overrides,
  };
}

function makeStep() {
  return {
    run: vi.fn().mockImplementation(async (_id: string, fn: () => Promise<unknown>) => fn()),
    waitForEvent: vi.fn().mockResolvedValue(null),
    sendEvent: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRunOverrideCardPath.mockResolvedValue(false);
});

describe('runValidateAndSubmit — validating + submitting transitions', () => {
  it('patches Validating then Submitting with matching status-log entries', async () => {
    await runValidateAndSubmit(makeCtx(), makeStep() as never);

    expect(mockPatchTask).toHaveBeenCalledWith(SUPABASE_URL, HEADERS, TASK_ID, {
      status: 'Validating',
    });
    expect(mockPatchTask).toHaveBeenCalledWith(SUPABASE_URL, HEADERS, TASK_ID, {
      status: 'Submitting',
    });
    expect(mockLogStatusTransition).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      'Validating',
      'Submitting',
    );
    expect(mockLogStatusTransition).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      'Submitting',
      'Validating',
    );
  });

  it('runs validating before submitting (ordering)', async () => {
    const step = makeStep();
    await runValidateAndSubmit(makeCtx(), step as never);

    const stepIds = (step.run as ReturnType<typeof vi.fn>).mock.calls.map(([id]: [string]) => id);
    expect(stepIds.indexOf('validating')).toBeLessThan(stepIds.indexOf('submitting'));
  });
});

describe('runValidateAndSubmit — no-approval routing', () => {
  it('routes to runNoApprovalPath when approvalRequired is false', async () => {
    await runValidateAndSubmit(makeCtx({ approvalRequired: false }), makeStep() as never);

    expect(mockRunNoApprovalPath).toHaveBeenCalledOnce();
    expect(mockRunOverrideCardPath).not.toHaveBeenCalled();
    expect(mockRunReviewingPath).not.toHaveBeenCalled();
  });

  it('forwards the no-approval context fields to runNoApprovalPath', async () => {
    await runValidateAndSubmit(makeCtx({ approvalRequired: false }), makeStep() as never);

    expect(mockRunNoApprovalPath).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: TASK_ID,
        archetypeId: ARCHETYPE_ID,
        tenantId: TENANT_ID,
        machineId: MACHINE_ID,
      }),
      expect.anything(),
    );
  });

  it('does not patch Reviewing when on the no-approval path', async () => {
    await runValidateAndSubmit(makeCtx({ approvalRequired: false }), makeStep() as never);

    expect(mockPatchTask).not.toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({ status: 'Reviewing' }),
    );
  });
});

describe('runValidateAndSubmit — approval routing', () => {
  it('routes to runReviewingPath when override is not handled', async () => {
    mockRunOverrideCardPath.mockResolvedValue(false);

    await runValidateAndSubmit(makeCtx({ approvalRequired: true }), makeStep() as never);

    expect(mockRunOverrideCardPath).toHaveBeenCalledOnce();
    expect(mockRunReviewingPath).toHaveBeenCalledOnce();
    expect(mockRunNoApprovalPath).not.toHaveBeenCalled();
  });

  it('short-circuits and skips runReviewingPath when the override card was handled', async () => {
    mockRunOverrideCardPath.mockResolvedValue(true);

    await runValidateAndSubmit(makeCtx({ approvalRequired: true }), makeStep() as never);

    expect(mockRunOverrideCardPath).toHaveBeenCalledOnce();
    expect(mockRunReviewingPath).not.toHaveBeenCalled();
  });

  it('passes the inngest client and timeoutHours through to runReviewingPath', async () => {
    mockRunOverrideCardPath.mockResolvedValue(false);

    await runValidateAndSubmit(
      makeCtx({ approvalRequired: true, timeoutHours: 6 }),
      makeStep() as never,
    );

    expect(mockRunReviewingPath).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: TASK_ID,
        timeoutHours: 6,
        inngest: expect.any(Object),
      }),
      expect.anything(),
    );
  });
});
