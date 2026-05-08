import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchLeadEnrichment } from '../../src/lib/hostfully-enrichment.js';

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchLeadEnrichment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── 1. Full data ─────────────────────────────────────────────────────────

  it('returns enriched data when lead has all fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          uid: 'x',
          guestInformation: { firstName: 'Jane', lastName: 'Smith' },
          checkInLocalDateTime: '2026-05-15T14:00:00Z',
          checkOutLocalDateTime: '2026-05-18T11:00:00Z',
          channel: 'AIRBNB',
        }),
      ),
    );
    const result = await fetchLeadEnrichment('lead-123', 'fake-key');
    expect(result.guestName).toBe('Jane Smith');
    expect(result.checkIn).toBe('May 15');
    expect(result.checkOut).toBe('May 18');
    expect(result.bookingChannel).toBe('AIRBNB');
    expect(result.propertyName).toBeNull();
  });

  // ─── 2. Missing guestInformation ─────────────────────────────────────────

  it('returns guestName=null when guestInformation is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          uid: 'x',
          checkInLocalDateTime: '2026-05-15T14:00:00Z',
          channel: 'VRBO',
        }),
      ),
    );
    const result = await fetchLeadEnrichment('lead-123', 'fake-key');
    expect(result.guestName).toBeNull();
    expect(result.bookingChannel).toBe('VRBO');
  });

  // ─── 3. API returns 500 ───────────────────────────────────────────────────

  it('returns all-null enrichment on non-OK HTTP response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ error: 'Internal Server Error' }, 500)),
    );
    const result = await fetchLeadEnrichment('lead-123', 'fake-key');
    expect(result.guestName).toBeNull();
    expect(result.propertyName).toBeNull();
    expect(result.checkIn).toBeNull();
    expect(result.checkOut).toBeNull();
    expect(result.bookingChannel).toBeNull();
  });

  // ─── 4. Fetch throws ─────────────────────────────────────────────────────

  it('returns all-null enrichment when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const result = await fetchLeadEnrichment('lead-123', 'fake-key');
    expect(result.guestName).toBeNull();
    expect(result.propertyName).toBeNull();
    expect(result.checkIn).toBeNull();
    expect(result.checkOut).toBeNull();
    expect(result.bookingChannel).toBeNull();
  });

  // ─── 5. Empty name fields ─────────────────────────────────────────────────

  it('returns guestName=null when firstName and lastName are both null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          uid: 'x',
          guestInformation: { firstName: null, lastName: null },
        }),
      ),
    );
    const result = await fetchLeadEnrichment('lead-123', 'fake-key');
    expect(result.guestName).toBeNull();
  });

  // ─── 6. No channel ────────────────────────────────────────────────────────

  it('returns bookingChannel=null when channel field is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          uid: 'x',
          guestInformation: { firstName: 'Bob', lastName: 'Jones' },
        }),
      ),
    );
    const result = await fetchLeadEnrichment('lead-123', 'fake-key');
    expect(result.bookingChannel).toBeNull();
    expect(result.guestName).toBe('Bob Jones');
  });

  // ─── 7. propertyName is always null ──────────────────────────────────────

  it('always returns propertyName=null (no second API call)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          uid: 'x',
          propertyUid: 'prop-abc',
          guestInformation: { firstName: 'Alice', lastName: 'Wonder' },
        }),
      ),
    );
    const mockFetch = vi.mocked(global.fetch);
    const result = await fetchLeadEnrichment('lead-123', 'fake-key');
    expect(result.propertyName).toBeNull();
    // Only one fetch call — no second call for property
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // ─── 8. Custom apiBaseUrl is used ────────────────────────────────────────

  it('uses the provided apiBaseUrl', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse({ uid: 'x' }));
    vi.stubGlobal('fetch', mockFetch);
    await fetchLeadEnrichment('lead-abc', 'key-xyz', 'https://custom.api.example.com/v1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://custom.api.example.com/v1'),
      expect.any(Object),
    );
  });
});
