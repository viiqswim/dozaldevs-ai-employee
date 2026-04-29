import { describe, it, expect } from 'vitest';
import { buildSupersededBlocks } from '../../src/lib/slack-blocks.js';

describe('buildSupersededBlocks', () => {
  it('returns an array of blocks', () => {
    const blocks = buildSupersededBlocks();
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('contains no actions block — buttons are removed in superseded state', () => {
    const blocks = buildSupersededBlocks();
    const actionsBlock = blocks.find((b) => (b as { type: string }).type === 'actions');
    expect(actionsBlock).toBeUndefined();
  });

  it('contains a section block', () => {
    const blocks = buildSupersededBlocks();
    const sectionBlock = blocks.find((b) => (b as { type: string }).type === 'section');
    expect(sectionBlock).toBeDefined();
  });

  it('section text includes the word "Superseded"', () => {
    const blocks = buildSupersededBlocks();
    const sectionBlock = blocks.find((b) => (b as { type: string }).type === 'section') as
      | { type: string; text: { text: string } }
      | undefined;
    expect(sectionBlock).toBeDefined();
    expect(sectionBlock!.text.text).toContain('Superseded');
  });

  it('section text includes the superseded emoji ⏭️', () => {
    const blocks = buildSupersededBlocks();
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('⏭️');
  });

  it('section text mentions that the response was not sent', () => {
    const blocks = buildSupersededBlocks();
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('not sent');
  });

  it('returns a new array on each call (no shared state)', () => {
    const blocks1 = buildSupersededBlocks();
    const blocks2 = buildSupersededBlocks();
    expect(blocks1).not.toBe(blocks2);
  });
});
