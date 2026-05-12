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

  // ─── 7. propertyName is fetched when propertyUid present ─────────────────

  it('fetches propertyName from the property API when propertyUid is present', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse({
          uid: 'x',
          propertyUid: 'prop-abc',
          guestInformation: { firstName: 'Alice', lastName: 'Wonder' },
        }),
      )
      .mockResolvedValueOnce(makeResponse({ name: 'Ocean View Suite' }));
    vi.stubGlobal('fetch', mockFetch);
    const result = await fetchLeadEnrichment('lead-123', 'fake-key');
    expect(result.propertyName).toBe('Ocean View Suite');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // ─── 8. Property API failure → graceful null ──────────────────────────────

  it('returns propertyName=null without throwing when property fetch fails', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse({
          uid: 'x',
          propertyUid: 'prop-abc',
          guestInformation: { firstName: 'Alice', lastName: 'Wonder' },
        }),
      )
      .mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', mockFetch);
    const result = await fetchLeadEnrichment('lead-123', 'fake-key');
    expect(result.propertyName).toBeNull();
    expect(result.guestName).toBe('Alice Wonder');
  });

  // ─── 9. No propertyUid → only one fetch ──────────────────────────────────

  it('does not fetch property when propertyUid is absent', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      makeResponse({
        uid: 'x',
        guestInformation: { firstName: 'Bob', lastName: 'Smith' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);
    const result = await fetchLeadEnrichment('lead-123', 'fake-key');
    expect(result.propertyName).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // ─── 10. Wrapped lead response `{ lead: { ... } }` is unwrapped ─────────

  it('unwraps wrapped lead response { lead: { ... } } and extracts all fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          lead: {
            uid: 'x',
            guestInformation: { firstName: 'Jane', lastName: 'Smith' },
            propertyUid: 'prop-1',
            channel: 'AIRBNB',
            checkInLocalDateTime: '2026-06-01T15:00:00',
            checkOutLocalDateTime: '2026-06-03T11:00:00',
          },
        }),
      ),
    );
    const result = await fetchLeadEnrichment('lead-123', 'fake-key');
    expect(result.guestName).toBe('Jane Smith');
    expect(result.bookingChannel).toBe('AIRBNB');
    expect(result.checkIn).not.toBeNull();
    expect(result.checkOut).not.toBeNull();
  });

  // ─── 11. Custom apiBaseUrl is used ───────────────────────────────────────

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
