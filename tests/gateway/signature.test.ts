import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  verifyJiraSignature,
  verifyGitHubSignature,
} from '../../src/gateway/validation/signature.js';
import { computeJiraSignature } from '../setup.js';

const SECRET = 'test-secret';
const BODY = '{"test": true}';

function computeExpectedSig(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyJiraSignature', () => {
  it('returns true for a valid signature', () => {
    const sig = computeExpectedSig(BODY, SECRET);
    expect(verifyJiraSignature(BODY, sig, SECRET)).toBe(true);
  });

  it('returns true using computeJiraSignature helper', () => {
    const sig = computeJiraSignature(BODY, SECRET);
    expect(verifyJiraSignature(BODY, sig, SECRET)).toBe(true);
  });

  it('returns false for tampered body', () => {
    const sig = computeExpectedSig(BODY, SECRET);
    expect(verifyJiraSignature('{"tampered": true}', sig, SECRET)).toBe(false);
  });

  it('returns false for wrong secret', () => {
    const sig = computeExpectedSig(BODY, SECRET);
    expect(verifyJiraSignature(BODY, sig, 'wrong-secret')).toBe(false);
  });

  it('returns false for missing sha256= prefix', () => {
    const hex = crypto.createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyJiraSignature(BODY, hex, SECRET)).toBe(false);
  });

  it('returns false for empty string header', () => {
    expect(verifyJiraSignature(BODY, '', SECRET)).toBe(false);
  });

  it('returns false for undefined header', () => {
    expect(verifyJiraSignature(BODY, undefined, SECRET)).toBe(false);
  });

  it('returns false for md5= prefix (wrong algorithm)', () => {
    expect(verifyJiraSignature(BODY, 'md5=abc123', SECRET)).toBe(false);
  });

  it('never throws even with malformed input', () => {
    expect(() => verifyJiraSignature('', 'not-a-valid-sig', '')).not.toThrow();
    expect(() => verifyJiraSignature('body', 'sha256=XXXXINVALIDHEX', 'secret')).not.toThrow();
  });
});

describe('verifyGitHubSignature', () => {
  it('returns true for a valid signature', () => {
    const sig = computeExpectedSig(BODY, SECRET);
    expect(verifyGitHubSignature(BODY, sig, SECRET)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyGitHubSignature(BODY, 'sha256=invalid', SECRET)).toBe(false);
  });
});
