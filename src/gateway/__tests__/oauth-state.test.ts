import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { signState, verifyState } from '../lib/oauth-state.js';

const TEST_KEY = 'a'.repeat(64);

describe('signState', () => {
  it('returns a string with a dot separator', () => {
    const result = signState('{"tenant_id":"abc","nonce":"xyz"}', TEST_KEY);
    expect(result).toContain('.');
  });

  it('base64url-encodes the payload before the dot', () => {
    const payload = '{"tenant_id":"abc","nonce":"xyz"}';
    const result = signState(payload, TEST_KEY);
    const b64Part = result.split('.')[0];
    expect(Buffer.from(b64Part, 'base64url').toString('utf8')).toBe(payload);
  });
});

describe('verifyState', () => {
  it('roundtrips a valid payload', () => {
    const payload = JSON.stringify({ tenant_id: 'tenant-1', nonce: 'nonce-abc' });
    const signed = signState(payload, TEST_KEY);
    const result = verifyState(signed, TEST_KEY);
    expect(result).toEqual({ tenant_id: 'tenant-1', nonce: 'nonce-abc' });
  });

  it('returns null when the state string has no dot', () => {
    expect(verifyState('nodothere', TEST_KEY)).toBeNull();
  });

  it('returns null when signed with a different key', () => {
    const payload = JSON.stringify({ tenant_id: 'tenant-1', nonce: 'nonce-abc' });
    const signed = signState(payload, TEST_KEY);
    expect(verifyState(signed, 'b'.repeat(64))).toBeNull();
  });

  it('returns null when the signature is tampered', () => {
    const payload = JSON.stringify({ tenant_id: 'tenant-1', nonce: 'nonce-abc' });
    const signed = signState(payload, TEST_KEY);
    const tampered = signed.slice(0, -4) + '0000';
    expect(verifyState(tampered, TEST_KEY)).toBeNull();
  });

  it('returns null when the payload is not valid JSON', () => {
    const badPayload = Buffer.from('not-json!!!').toString('base64url');
    const sig = crypto.createHmac('sha256', TEST_KEY).update(badPayload).digest('hex');
    expect(verifyState(`${badPayload}.${sig}`, TEST_KEY)).toBeNull();
  });
});
