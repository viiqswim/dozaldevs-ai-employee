import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockWarn = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/logger.js', () => ({
  createLogger: () => ({ warn: mockWarn, info: vi.fn() }),
}));

vi.mock('../../../src/lib/fly-client.js', () => ({ destroyMachine: vi.fn() }));
vi.mock('../../../src/inngest/lib/lifecycle-helpers.js', () => ({
  recordWorkMetric: vi.fn(),
  stopLocalDockerContainer: vi.fn(),
}));

import { mergeTaskMetadata } from '../../../src/inngest/lifecycle/steps/lifecycle-helpers.js';

const SUPABASE_URL = 'http://localhost:54321';
const TASK_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HEADERS = {
  apikey: 'test-key',
  Authorization: 'Bearer test-key',
  'Content-Type': 'application/json',
};

describe('mergeTaskMetadata', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockWarn.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shallow-spreads updates onto existing metadata and preserves existing keys', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: async () => [
          { metadata: { notify_slack_ts: 'ts-123', notify_slack_channel: 'C-CHAN' } },
        ],
      })
      .mockResolvedValueOnce({ ok: true });

    await mergeTaskMetadata(SUPABASE_URL, HEADERS, TASK_ID, { inngest_run_id: 'run-456' });

    const patchCall = mockFetch.mock.calls[1];
    const body = JSON.parse(patchCall[1].body as string) as { metadata: Record<string, unknown> };
    expect(body.metadata).toMatchObject({
      notify_slack_ts: 'ts-123',
      notify_slack_channel: 'C-CHAN',
      inngest_run_id: 'run-456',
    });
  });

  it('sets updated_at to a fresh ISO string', async () => {
    const before = Date.now();
    mockFetch
      .mockResolvedValueOnce({ json: async () => [{ metadata: {} }] })
      .mockResolvedValueOnce({ ok: true });

    await mergeTaskMetadata(SUPABASE_URL, HEADERS, TASK_ID, { foo: 'bar' });

    const patchCall = mockFetch.mock.calls[1];
    const body = JSON.parse(patchCall[1].body as string) as { metadata: Record<string, unknown> };
    const updatedAt = new Date(body.metadata.updated_at as string).getTime();
    expect(updatedAt).toBeGreaterThanOrEqual(before);
    expect(updatedAt).toBeLessThanOrEqual(Date.now());
  });

  it('coalesces metadata: null to {}', async () => {
    mockFetch
      .mockResolvedValueOnce({ json: async () => [{ metadata: null }] })
      .mockResolvedValueOnce({ ok: true });

    await mergeTaskMetadata(SUPABASE_URL, HEADERS, TASK_ID, { key: 'val' });

    const patchCall = mockFetch.mock.calls[1];
    const body = JSON.parse(patchCall[1].body as string) as { metadata: Record<string, unknown> };
    expect(body.metadata).toMatchObject({ key: 'val' });
    expect(body.metadata.updated_at).toBeDefined();
  });

  it('emits log.warn with taskId and status when PATCH fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ json: async () => [{ metadata: {} }] })
      .mockResolvedValueOnce({ ok: false, status: 409 });

    await mergeTaskMetadata(SUPABASE_URL, HEADERS, TASK_ID, { foo: 'bar' });

    expect(mockWarn).toHaveBeenCalledOnce();
    expect(mockWarn).toHaveBeenCalledWith(
      { taskId: TASK_ID, status: 409 },
      'Failed to merge task metadata',
    );
  });
});
