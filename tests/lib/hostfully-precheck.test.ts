import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkLastMessageSender } from '../../src/lib/hostfully-precheck.js';

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('checkLastMessageSender', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── 1. Last message from AGENCY → lastSenderIsHost: true ────────────────

  it('returns lastSenderIsHost=true when last message is from AGENCY', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          messages: [
            { uid: '1', senderType: 'GUEST', createdUtcDateTime: '2026-01-01T00:00:00Z' },
            { uid: '2', senderType: 'AGENCY', createdUtcDateTime: '2026-01-01T01:00:00Z' },
          ],
        }),
      ),
    );
    const result = await checkLastMessageSender('lead-123', 'fake-key');
    expect(result.lastSenderIsHost).toBe(true);
    expect(result.error).toBeUndefined();
  });

  // ─── 2. Last message from GUEST → lastSenderIsHost: false ────────────────

  it('returns lastSenderIsHost=false when last message is from GUEST', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          messages: [
            { uid: '1', senderType: 'AGENCY', createdUtcDateTime: '2026-01-01T00:00:00Z' },
            { uid: '2', senderType: 'GUEST', createdUtcDateTime: '2026-01-01T01:00:00Z' },
          ],
        }),
      ),
    );
    const result = await checkLastMessageSender('lead-123', 'fake-key');
    expect(result.lastSenderIsHost).toBe(false);
  });

  // ─── 3. Empty messages array → safe fallback ─────────────────────────────

  it('returns lastSenderIsHost=false when messages array is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ messages: [] })));
    const result = await checkLastMessageSender('lead-123', 'fake-key');
    expect(result.lastSenderIsHost).toBe(false);
  });

  // ─── 4. Network error → safe fallback ────────────────────────────────────

  it('returns lastSenderIsHost=false on network error (safe fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
    const result = await checkLastMessageSender('lead-123', 'fake-key');
    expect(result.lastSenderIsHost).toBe(false);
    expect(result.error).toBeDefined();
  });

  // ─── 5. Non-OK HTTP response → safe fallback ─────────────────────────────

  it('returns lastSenderIsHost=false on non-OK HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ error: 'Unauthorized' }, 401)));
    const result = await checkLastMessageSender('lead-123', 'fake-key');
    expect(result.lastSenderIsHost).toBe(false);
    expect(result.error).toContain('401');
  });

  // ─── 6. Malformed JSON → safe fallback ───────────────────────────────────

  it('returns lastSenderIsHost=false on malformed JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('not-json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
        ),
    );
    const result = await checkLastMessageSender('lead-123', 'fake-key');
    expect(result.lastSenderIsHost).toBe(false);
  });

  // ─── 7. Chronological sort — API returns newest-first ────────────────────

  it('sorts by createdUtcDateTime to find the truly last message', async () => {
    // API returns newest-first (AGENCY first), but chronologically GUEST is last
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          messages: [
            { uid: '2', senderType: 'AGENCY', createdUtcDateTime: '2026-01-01T01:00:00Z' },
            { uid: '1', senderType: 'GUEST', createdUtcDateTime: '2026-01-01T00:00:00Z' },
          ],
        }),
      ),
    );
    // After sorting ascending, GUEST (00:00) comes before AGENCY (01:00)
    // So last message is AGENCY → lastSenderIsHost: true
    const result = await checkLastMessageSender('lead-123', 'fake-key');
    expect(result.lastSenderIsHost).toBe(true);
  });

  // ─── 8. Custom apiBaseUrl is used ────────────────────────────────────────

  it('uses the provided apiBaseUrl', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse({ messages: [] }));
    vi.stubGlobal('fetch', mockFetch);
    await checkLastMessageSender('lead-abc', 'key-xyz', 'https://custom.api.example.com/v1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://custom.api.example.com/v1'),
      expect.any(Object),
    );
  });
});
