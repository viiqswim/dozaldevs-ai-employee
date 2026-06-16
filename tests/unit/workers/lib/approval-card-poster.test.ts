import { describe, it, expect } from 'vitest';
import {
  buildApprovalBlocks,
  type ApprovalBlockData,
} from '../../../../src/workers/lib/approval-card-poster.mjs';

interface HeaderBlock {
  type: string;
  text?: { type: string; text: string };
}

function headerOf(blocks: unknown[]): HeaderBlock {
  return blocks[0] as HeaderBlock;
}

describe('buildApprovalBlocks — header length cap', () => {
  const base: ApprovalBlockData = {
    summary: '',
    classification: 'NEEDS_APPROVAL',
    taskId: 'abc12345-0000-0000-0000-000000000000',
  };

  it('keeps the header at or under 150 chars even with a very long summary', () => {
    const blocks = buildApprovalBlocks({ ...base, summary: 'x'.repeat(500) });
    const header = headerOf(blocks);
    expect(header.type).toBe('header');
    expect(header.text!.text.length).toBeLessThanOrEqual(150);
  });

  it('keeps the header under 150 chars with the urgency prefix and a long summary', () => {
    const blocks = buildApprovalBlocks({
      ...base,
      urgency: true,
      summary: 'Executive summary '.repeat(20),
    });
    const header = headerOf(blocks);
    expect(header.text!.text.length).toBeLessThanOrEqual(150);
  });

  it('preserves the prefix at the start of the header', () => {
    const blocks = buildApprovalBlocks({ ...base, summary: 'y'.repeat(300) });
    const header = headerOf(blocks);
    expect(header.text!.text.startsWith('📝')).toBe(true);
  });

  it('does not truncate a short summary', () => {
    const blocks = buildApprovalBlocks({ ...base, summary: 'All channels reviewed.' });
    const header = headerOf(blocks);
    expect(header.text!.text).toBe('📝 All channels reviewed.');
  });
});
