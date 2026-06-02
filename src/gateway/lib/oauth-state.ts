import crypto from 'crypto';

export function signState(payload: string, key: string): string {
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(b64).digest('hex');
  return `${b64}.${sig}`;
}

export function verifyState(
  signed: string,
  key: string,
): { tenant_id: string; nonce: string } | null {
  const dot = signed.lastIndexOf('.');
  if (dot === -1) return null;
  const b64 = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = crypto.createHmac('sha256', key).update(b64).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  try {
    return JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as {
      tenant_id: string;
      nonce: string;
    };
  } catch {
    return null;
  }
}
