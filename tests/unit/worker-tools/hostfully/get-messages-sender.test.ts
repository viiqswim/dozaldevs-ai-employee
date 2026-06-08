import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the senderType classification logic in get-messages.ts.
 *
 * These functions mirror the exact expressions used in the tool:
 *   Line 231/324: const unresponded = !!lastMessage?.senderType && lastMessage.senderType !== 'AGENCY';
 *   Line 238/331: sender: m.senderType === 'AGENCY' ? 'host' : m.senderType ? 'guest' : null
 *
 * Testing inline rather than importing the CLI script avoids the HOSTFULLY_MOCK
 * path which bypasses all classification logic (early return before processing).
 */

function mapSenderToOutput(senderType: string | undefined | null): 'guest' | 'host' | null {
  return senderType === 'AGENCY' ? 'host' : senderType ? 'guest' : null;
}

function computeUnresponded(senderType: string | undefined | null): boolean {
  return !!senderType && senderType !== 'AGENCY';
}

describe('get-messages senderType classification (defensive hardening)', () => {
  describe('mapSenderToOutput — maps raw senderType to output sender field', () => {
    it('"GUEST" → "guest"', () => {
      expect(mapSenderToOutput('GUEST')).toBe('guest');
    });

    it('"AGENCY" → "host"', () => {
      expect(mapSenderToOutput('AGENCY')).toBe('host');
    });

    it('"AIRBNB_GUEST" → "guest" (OTA relay treated as guest)', () => {
      expect(mapSenderToOutput('AIRBNB_GUEST')).toBe('guest');
    });

    it('"OTA" → "guest"', () => {
      expect(mapSenderToOutput('OTA')).toBe('guest');
    });

    it('"HOST" → "guest" (non-AGENCY string = guest, not host)', () => {
      expect(mapSenderToOutput('HOST')).toBe('guest');
    });

    it('null → null (no senderType = unknown)', () => {
      expect(mapSenderToOutput(null)).toBe(null);
    });

    it('undefined → null', () => {
      expect(mapSenderToOutput(undefined)).toBe(null);
    });

    it('"" (empty string) → null', () => {
      expect(mapSenderToOutput('')).toBe(null);
    });
  });

  describe('computeUnresponded — determines if last message requires a reply', () => {
    it('"GUEST" → true (guest sent last message, needs reply)', () => {
      expect(computeUnresponded('GUEST')).toBe(true);
    });

    it('"AGENCY" → false (host/agency replied last, no action needed)', () => {
      expect(computeUnresponded('AGENCY')).toBe(false);
    });

    it('"AIRBNB_GUEST" → true (OTA relay treated as guest, needs reply)', () => {
      expect(computeUnresponded('AIRBNB_GUEST')).toBe(true);
    });

    it('"OTA" → true (OTA sender treated as guest)', () => {
      expect(computeUnresponded('OTA')).toBe(true);
    });

    it('"HOST" → true (non-AGENCY string = guest-side, needs reply)', () => {
      expect(computeUnresponded('HOST')).toBe(true);
    });

    it('null → false (no senderType = not a guest message)', () => {
      expect(computeUnresponded(null)).toBe(false);
    });

    it('undefined → false', () => {
      expect(computeUnresponded(undefined)).toBe(false);
    });

    it('"" (empty string) → false', () => {
      expect(computeUnresponded('')).toBe(false);
    });
  });
});
