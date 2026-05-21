import { describe, it, expect } from 'vitest';
import { generateToolReference } from '../tool-reference-generator.mjs';

describe('generateToolReference', () => {
  it('happy path — real filesystem tool produces description and skill note', async () => {
    const result = await generateToolReference(
      ['/tools/slack/post-message.ts'],
      'src/worker-tools',
    );

    expect(result).toContain('post-message');
    expect(result).toContain('/tools/slack/post-message.ts');
    expect(result).toContain('tool-usage-reference');
    // Should have a non-trivial description (not just the tool name)
    expect(result).toContain('## Available Tools');
  });

  it('missing tool — graceful fallback, no throw', async () => {
    const result = await generateToolReference(
      ['/tools/nonexistent/fake-tool.ts'],
      'src/worker-tools',
    );

    // Must not throw — output must contain fallback entry with the tool name
    expect(result).toContain('fake-tool');
    expect(result).toContain('## Available Tools');
  });

  it('auto-appends submit-output when not present', async () => {
    const result = await generateToolReference([], 'src/worker-tools');

    expect(result).toContain('submit-output');
    expect(result).toContain('/tools/platform/submit-output.ts');
  });

  it('no duplicate submit-output when already in toolPaths', async () => {
    const result = await generateToolReference(
      ['/tools/platform/submit-output.ts'],
      'src/worker-tools',
    );

    // Count occurrences of "submit-output" entries
    const matches = result.match(/\*\*submit-output\*\*/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });
});
