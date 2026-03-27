import crypto from 'crypto';

/**
 * Verify Jira webhook HMAC-SHA256 signature.
 * Jira sends: X-Hub-Signature: sha256=<hex>
 * Returns true if valid, false on any error (never throws).
 */
export function verifyJiraSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  try {
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }
    const receivedHex = signatureHeader.slice('sha256='.length);
    if (!receivedHex) return false;

    const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const receivedBuffer = Buffer.from(receivedHex, 'hex');
    const expectedBuffer = Buffer.from(expectedHex, 'hex');

    // Buffers must be same length for timingSafeEqual
    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Verify GitHub webhook HMAC-SHA256 signature.
 * GitHub sends: X-Hub-Signature-256: sha256=<hex>
 * Returns true if valid, false on any error (never throws).
 */
export function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  // Same algorithm as Jira (both use sha256= prefix)
  return verifyJiraSignature(rawBody, signatureHeader, secret);
}
