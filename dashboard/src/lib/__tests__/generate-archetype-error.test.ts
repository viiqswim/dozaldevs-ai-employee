import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateArchetype } from '@/lib/gateway';

describe('generateArchetype — friendly error parsing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchRejecting(status: number, body: unknown) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  it('throws with the friendly message from the structured error body', async () => {
    mockFetchRejecting(422, {
      error: 'GENERATION_FAILED',
      message: "We couldn't generate your employee from that description. Please try again.",
      details: 'GENERATION_FAILED: LLM returned invalid JSON — SyntaxError',
    });

    await expect(generateArchetype('tenant-1', 'do a thing')).rejects.toThrow(
      /couldn't generate your employee/i,
    );
  });

  it('does not leak technical noise (status code, raw JSON, GENERATION_FAILED) into the thrown message', async () => {
    mockFetchRejecting(422, {
      error: 'GENERATION_FAILED',
      message: "We couldn't generate your employee from that description. Please try again.",
      details: 'GENERATION_FAILED: LLM returned invalid JSON — SyntaxError',
    });

    let caught: unknown;
    try {
      await generateArchetype('tenant-1', 'do a thing');
    } catch (err) {
      caught = err;
    }

    const msg = caught instanceof Error ? caught.message : String(caught);
    expect(msg).not.toMatch(/Gateway error/i);
    expect(msg).not.toMatch(/422/);
    expect(msg).not.toMatch(/GENERATION_FAILED/);
    expect(msg).not.toMatch(/[{}]/);
    expect(msg).not.toMatch(/invalid JSON/i);
  });

  it('falls back to a generic friendly message when the body has no message field', async () => {
    mockFetchRejecting(500, { error: 'INTERNAL_ERROR' });

    let caught: unknown;
    try {
      await generateArchetype('tenant-1', 'do a thing');
    } catch (err) {
      caught = err;
    }

    const msg = caught instanceof Error ? caught.message : String(caught);
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).not.toMatch(/Gateway error/i);
    expect(msg).not.toMatch(/500/);
    expect(msg).not.toMatch(/INTERNAL_ERROR/);
    expect(msg).not.toMatch(/[{}]/);
  });

  it('falls back to a generic friendly message when the body is not valid JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    );

    let caught: unknown;
    try {
      await generateArchetype('tenant-1', 'do a thing');
    } catch (err) {
      caught = err;
    }

    const msg = caught instanceof Error ? caught.message : String(caught);
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).not.toMatch(/Gateway error/i);
    expect(msg).not.toMatch(/502/);
    expect(msg).not.toMatch(/<html>/i);
  });
});
