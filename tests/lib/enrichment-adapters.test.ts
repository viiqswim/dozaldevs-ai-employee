import { describe, it, expect, vi } from 'vitest';

// Must be hoisted before any adapter imports
vi.mock('../../src/lib/hostfully-enrichment.js', () => ({
  fetchLeadEnrichment: vi.fn().mockResolvedValue({
    guestName: 'Olivia',
    propertyName: 'Casa del Sol',
    checkIn: '2026-06-01',
    checkOut: '2026-06-07',
    bookingChannel: 'Airbnb',
  }),
}));

import { registerAdapter, getAdapter } from '../../src/lib/enrichment-adapters/index.js';
// Side-effect import — self-registers 'hostfully' adapter into the registry
import '../../src/lib/enrichment-adapters/hostfully.js';

describe('enrichment adapter registry', () => {
  it('registers and retrieves an adapter', () => {
    const mockAdapter = vi.fn();
    registerAdapter('test-adapter', mockAdapter);
    expect(getAdapter('test-adapter')).toBe(mockAdapter);
  });

  it('returns undefined for unknown adapter', () => {
    expect(getAdapter('nonexistent-adapter-xyz')).toBeUndefined();
  });

  it('overwrites an existing adapter when the same name is re-registered', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerAdapter('overwrite-test', first);
    registerAdapter('overwrite-test', second);
    expect(getAdapter('overwrite-test')).toBe(second);
  });
});

describe('hostfully enrichment adapter', () => {
  it('is registered under the "hostfully" key after side-effect import', () => {
    expect(getAdapter('hostfully')).toBeDefined();
  });

  it('returns NotificationEnrichment with displayName from guestName', async () => {
    const adapter = getAdapter('hostfully')!;
    const result = await adapter(
      { lead_uid: 'test-lead', thread_uid: 'test-thread' },
      { HOSTFULLY_API_KEY: 'test-key' },
    );
    expect(result).not.toBeNull();
    expect(result?.displayName).toBe('Guest: Olivia');
  });

  it('returns subtitle from propertyName', async () => {
    const adapter = getAdapter('hostfully')!;
    const result = await adapter(
      { lead_uid: 'test-lead', thread_uid: 'test-thread' },
      { HOSTFULLY_API_KEY: 'test-key' },
    );
    expect(result?.subtitle).toBe('Property: Casa del Sol');
  });

  it('returns metadata containing checkIn', async () => {
    const adapter = getAdapter('hostfully')!;
    const result = await adapter(
      { lead_uid: 'test-lead', thread_uid: 'test-thread' },
      { HOSTFULLY_API_KEY: 'test-key' },
    );
    expect(result?.metadata?.checkIn).toBe('2026-06-01');
  });

  it('returns contextUrl built from thread_uid and lead_uid', async () => {
    const adapter = getAdapter('hostfully')!;
    const result = await adapter(
      { lead_uid: 'lead-abc', thread_uid: 'thread-xyz' },
      { HOSTFULLY_API_KEY: 'test-key' },
    );
    expect(result?.contextUrl).toContain('thread-xyz');
    expect(result?.contextUrl).toContain('lead-abc');
    expect(result?.contextUrl).toContain('platform.hostfully.com');
  });

  it('omits contextUrl when thread_uid is missing', async () => {
    const adapter = getAdapter('hostfully')!;
    const result = await adapter({ lead_uid: 'lead-abc' }, { HOSTFULLY_API_KEY: 'test-key' });
    expect(result?.contextUrl).toBeUndefined();
  });

  it('returns null when lead_uid is missing', async () => {
    const adapter = getAdapter('hostfully')!;
    const result = await adapter({}, { HOSTFULLY_API_KEY: 'test-key' });
    expect(result).toBeNull();
  });

  it('returns null when lead_uid is an empty string', async () => {
    const adapter = getAdapter('hostfully')!;
    const result = await adapter({ lead_uid: '' }, { HOSTFULLY_API_KEY: 'test-key' });
    expect(result).toBeNull();
  });

  it('returns null when HOSTFULLY_API_KEY is missing', async () => {
    const adapter = getAdapter('hostfully')!;
    const result = await adapter({ lead_uid: 'test-lead' }, {});
    expect(result).toBeNull();
  });

  it('returns null when lead_uid is not a string', async () => {
    const adapter = getAdapter('hostfully')!;
    const result = await adapter(
      { lead_uid: 123 as unknown as string },
      { HOSTFULLY_API_KEY: 'test-key' },
    );
    expect(result).toBeNull();
  });
});
