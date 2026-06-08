import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockWarn = vi.hoisted(() => vi.fn());
const mockInfo = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/lib/logger.js', () => ({
  createLogger: () => ({ warn: mockWarn, info: mockInfo }),
}));

vi.mock('../../../../src/lib/fly-client.js', () => ({ destroyMachine: vi.fn() }));
vi.mock(
  '../../../../src/inngest/lib/lifecycle-helpers.js',
  async (importOriginal: () => Promise<Record<string, unknown>>) => {
    const actual = await importOriginal();
    return {
      ...actual,
      recordWorkMetric: vi.fn(),
      stopLocalDockerContainer: vi.fn(),
    };
  },
);

import { writeFeedbackEvent } from '../../../../src/inngest/lifecycle/steps/lifecycle-helpers.js';
import { makePostgrestHeaders } from '../../../../src/inngest/lib/postgrest-headers.js';
import { patchTask } from '../../../../src/inngest/lib/lifecycle-helpers.js';

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_KEY = 'test-supa-key';
const TASK_ID = 'ffff0001-0000-0000-0000-000000000000';
const TENANT_ID = '00000000-0000-0000-0000-000000000002';
const ARCHETYPE_ID = 'arch0001-0000-0000-0000-000000000000';
const HEADERS = makePostgrestHeaders(SUPABASE_KEY);

describe('makePostgrestHeaders', () => {
  it('returns headers containing apikey, Authorization, Content-Type, and Prefer', () => {
    const headers = makePostgrestHeaders('my-key-abc');
    expect(headers).toMatchObject({
      apikey: 'my-key-abc',
      Authorization: 'Bearer my-key-abc',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    });
  });

  it('uses the provided key for both apikey and Authorization bearer', () => {
    const key = 'unique-key-xyz';
    const headers = makePostgrestHeaders(key);
    expect(headers.apikey).toBe(key);
    expect(headers['Authorization']).toBe(`Bearer ${key}`);
  });

  it('returns a plain object (not null, not array)', () => {
    const headers = makePostgrestHeaders('k');
    expect(typeof headers).toBe('object');
    expect(Array.isArray(headers)).toBe(false);
    expect(headers).not.toBeNull();
  });
});

describe('patchTask', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a PATCH request to the tasks endpoint with the correct taskId', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await patchTask(SUPABASE_URL, HEADERS, TASK_ID, { status: 'Done' });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${TASK_ID}`);
    expect(init.method).toBe('PATCH');
  });

  it('includes the supplied fields in the request body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await patchTask(SUPABASE_URL, HEADERS, TASK_ID, { status: 'Failed', failure_reason: 'oops' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.status).toBe('Failed');
    expect(body.failure_reason).toBe('oops');
  });

  it('always appends updated_at as an ISO timestamp', async () => {
    const before = Date.now();
    mockFetch.mockResolvedValueOnce({ ok: true });

    await patchTask(SUPABASE_URL, HEADERS, TASK_ID, { status: 'Executing' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    const updatedAt = new Date(body.updated_at as string).getTime();
    expect(updatedAt).toBeGreaterThanOrEqual(before);
    expect(updatedAt).toBeLessThanOrEqual(Date.now());
  });

  it('throws when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: async () => 'conflict',
    });

    await expect(patchTask(SUPABASE_URL, HEADERS, TASK_ID, { status: 'Done' })).rejects.toThrow(
      /patchTask failed/,
    );
  });

  it('passes the supplied headers to fetch', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await patchTask(SUPABASE_URL, HEADERS, TASK_ID, {});

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['apikey']).toBe(SUPABASE_KEY);
  });
});

describe('writeFeedbackEvent', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockWarn.mockClear();
    mockInfo.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to /feedback_events with correct base fields', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await writeFeedbackEvent({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      tenantId: TENANT_ID,
      archetypeId: ARCHETYPE_ID,
      taskId: TASK_ID,
      eventType: 'rejection',
      actorId: 'U-ACTOR',
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/feedback_events');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      tenant_id: TENANT_ID,
      archetype_id: ARCHETYPE_ID,
      task_id: TASK_ID,
      event_type: 'rejection',
      actor_id: 'U-ACTOR',
    });
    expect(typeof body.id).toBe('string');
  });

  it('includes correction_content when provided', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await writeFeedbackEvent({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      tenantId: TENANT_ID,
      archetypeId: ARCHETYPE_ID,
      taskId: TASK_ID,
      eventType: 'rejection_reason',
      actorId: 'U-ACTOR',
      correctionContent: 'Too formal',
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.correction_content).toBe('Too formal');
  });

  it('omits correction_content when not provided', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await writeFeedbackEvent({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      tenantId: TENANT_ID,
      archetypeId: ARCHETYPE_ID,
      taskId: TASK_ID,
      eventType: 'rejection',
      actorId: 'U-ACTOR',
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect('correction_content' in body).toBe(false);
  });

  it('includes original_content when provided', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await writeFeedbackEvent({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      tenantId: TENANT_ID,
      archetypeId: ARCHETYPE_ID,
      taskId: TASK_ID,
      eventType: 'edit',
      actorId: 'U-ACTOR',
      originalContent: 'Original draft text',
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.original_content).toBe('Original draft text');
  });

  it('emits log.info on success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await writeFeedbackEvent({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      tenantId: TENANT_ID,
      archetypeId: ARCHETYPE_ID,
      taskId: TASK_ID,
      eventType: 'approval',
      actorId: 'U-ACTOR',
    });

    expect(mockInfo).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: TASK_ID, eventType: 'approval' }),
      expect.stringContaining('approval'),
    );
  });

  it('emits log.warn and does NOT throw when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => 'validation error',
    });

    await expect(
      writeFeedbackEvent({
        supabaseUrl: SUPABASE_URL,
        supabaseKey: SUPABASE_KEY,
        tenantId: TENANT_ID,
        archetypeId: ARCHETYPE_ID,
        taskId: TASK_ID,
        eventType: 'rejection',
        actorId: 'U-ACTOR',
      }),
    ).resolves.toBeUndefined();

    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: TASK_ID, status: 422 }),
      expect.stringContaining('Failed to write rejection feedback_event'),
    );
  });

  it('emits log.warn and does NOT throw when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network failure'));

    await expect(
      writeFeedbackEvent({
        supabaseUrl: SUPABASE_URL,
        supabaseKey: SUPABASE_KEY,
        tenantId: TENANT_ID,
        archetypeId: ARCHETYPE_ID,
        taskId: TASK_ID,
        eventType: 'rejection',
        actorId: 'U-ACTOR',
      }),
    ).resolves.toBeUndefined();

    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: TASK_ID }),
      expect.stringContaining('Error writing rejection feedback_event'),
    );
  });

  it('uses Prefer: return=minimal header (not the default representation)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await writeFeedbackEvent({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      tenantId: TENANT_ID,
      archetypeId: ARCHETYPE_ID,
      taskId: TASK_ID,
      eventType: 'rejection',
      actorId: 'U-ACTOR',
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Prefer']).toBe('return=minimal');
  });
});
