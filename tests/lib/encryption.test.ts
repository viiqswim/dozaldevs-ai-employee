import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { encrypt, decrypt, validateEncryptionKey } from '../../src/lib/encryption.js';

const VALID_KEY = 'a'.repeat(64);

beforeEach(() => {
  vi.stubEnv('ENCRYPTION_KEY', VALID_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('encrypt / decrypt', () => {
  it('roundtrip: decrypt(encrypt(plaintext)) returns original', () => {
    const result = decrypt(encrypt('hello'));
    expect(result).toBe('hello');
  });

  it('roundtrip with empty string', () => {
    const result = decrypt(encrypt(''));
    expect(result).toBe('');
  });

  it('roundtrip with unicode', () => {
    const result = decrypt(encrypt('héllo 世界'));
    expect(result).toBe('héllo 世界');
  });

  it('tamper detection: modified ciphertext causes decrypt to throw', () => {
    const payload = encrypt('secret');
    const tampered = { ...payload, ciphertext: Buffer.from('bad').toString('base64') };
    expect(() => decrypt(tampered)).toThrow();
  });

  it('tamper detection: modified auth_tag causes decrypt to throw', () => {
    const payload = encrypt('secret');
    const tampered = { ...payload, auth_tag: Buffer.from('0'.repeat(16)).toString('base64') };
    expect(() => decrypt(tampered)).toThrow();
  });

  it('IV randomness: encrypting same plaintext twice produces different ciphertexts', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });
});

describe('validateEncryptionKey', () => {
  it('throws when ENCRYPTION_KEY is missing', () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect(() => validateEncryptionKey()).toThrow('ENCRYPTION_KEY missing or malformed');
  });

  it('throws when ENCRYPTION_KEY is too short', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'abc123');
    expect(() => validateEncryptionKey()).toThrow('ENCRYPTION_KEY missing or malformed');
  });

  it('throws when ENCRYPTION_KEY contains non-hex characters', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'z'.repeat(64));
    expect(() => validateEncryptionKey()).toThrow('ENCRYPTION_KEY missing or malformed');
  });

  it('succeeds with a valid 64-char hex key', () => {
    vi.stubEnv('ENCRYPTION_KEY', VALID_KEY);
    expect(() => validateEncryptionKey()).not.toThrow();
  });
});
