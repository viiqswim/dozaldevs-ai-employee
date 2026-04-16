import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  auth_tag: string;
}

function getKeyBuffer(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? '';
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string): EncryptedPayload {
  const key = getKeyBuffer();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
  };
}

export function decrypt(payload: EncryptedPayload): string {
  const key = getKeyBuffer();
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.auth_tag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

export function validateEncryptionKey(): void {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || !/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('ENCRYPTION_KEY missing or malformed (must be 64-char hex string)');
  }
}

export function assertNoPlaintextLogged(plaintext: string, logOutput: string): void {
  if (logOutput.includes(plaintext)) {
    throw new Error('Plaintext secret found in log output — encryption guardrail violated');
  }
}
