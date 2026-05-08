import { describe, it, expect, vi } from 'vitest';

// vi.hoisted fires before vi.mock and before any static imports.
// We set process.argv with --title 'My Title' so that when the module loads
// and calls main() at module level, it parses the title correctly.
const { mockPostMessage } = vi.hoisted(() => {
  process.argv = [
    'node',
    'post-message.ts',
    '--channel',
    'C1',
    '--text',
    'hello',
    '--task-id',
    'tid',
    '--title',
    'My Title',
  ];
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
  // Suppress JSON output written by main() to stdout
  process.stdout.write = (() => true) as typeof process.stdout.write;

  const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'ts1', channel: 'C1' });
  return { mockPostMessage };
});

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
  })),
}));

import { buildApprovalBlocks } from '../../../src/worker-tools/slack/post-message.js';

describe('buildApprovalBlocks', () => {
  // ─── 1. Custom title ──────────────────────────────────────────────────────

  it('uses custom title when title param is provided', () => {
    const blocks = buildApprovalBlocks(
      'summary text',
      'task-uuid',
      'Mon Apr 7 2026',
      'Custom Title',
    );
    const header = blocks[0] as {
      type: string;
      block_id: string;
      text: { type: string; text: string };
    };

    expect(header.type).toBe('header');
    expect(header.text.text).toBe('Custom Title');
    expect(header.block_id).toBe('papi-chulo-daily-summary');
  });

  // ─── 2. Generic fallback ──────────────────────────────────────────────────

  it('falls back to "Task Review — <date>" format when title is omitted', () => {
    const blocks = buildApprovalBlocks('summary text', 'task-uuid', 'Mon Apr 7 2026');
    const header = blocks[0] as {
      type: string;
      block_id: string;
      text: { text: string };
    };

    expect(header.type).toBe('header');
    expect(header.text.text).toBe('Task Review — Mon Apr 7 2026');
    expect(header.block_id).toBe('papi-chulo-daily-summary');
  });

  // ─── 3. block_id preserved when title is set ──────────────────────────────

  it('preserves block_id "papi-chulo-daily-summary" even when custom title is provided', () => {
    const blocks = buildApprovalBlocks('any text', 'any-id', 'Mon', 'Any Custom Title');
    const header = blocks[0] as { block_id: string };

    expect(header.block_id).toBe('papi-chulo-daily-summary');
  });
});

describe('parseArgs --title flag', () => {
  // parseArgs is not exported, so we verify its behavior by inspecting what
  // main() (called at module load time) passes to WebClient.chat.postMessage.
  // The argv was configured with '--title My Title' in vi.hoisted above.

  it('correctly parses --title from process.argv and passes it to buildApprovalBlocks', async () => {
    // Allow the module-level async main() to fully resolve before asserting.
    // The mock resolves immediately, so 50ms gives the event loop ample time.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(mockPostMessage).toHaveBeenCalled();

    const callArg = mockPostMessage.mock.calls[0][0] as { blocks: unknown[] };
    const header = callArg.blocks[0] as { text: { text: string } };

    expect(header.text.text).toBe('My Title');
  });
});
