import { describe, it, expect } from 'vitest';
import { renderTool } from '../../../scripts/generate-tool-usage-skill.js';
import { toolInvocationPath, type ToolDescriptor } from '../../../src/lib/tool-registry.js';

const sifelyDescriptor: ToolDescriptor = {
  id: 'list-locks',
  service: 'sifely',
  description: 'List all Sifely smart locks accessible to the authenticated account',
  envVars: ['SIFELY_CLIENT_ID', 'SIFELY_USERNAME', 'SIFELY_PASSWORD'],
  args: [],
};

describe('renderTool', () => {
  it('emits a derived **Invocation** line for the descriptor', () => {
    const output = renderTool(sifelyDescriptor).join('\n');
    expect(output).toContain('**Invocation**: `tsx /tools/sifely/list-locks.ts [flags]`');
  });

  it('renders an invocation path identical to the shared toolInvocationPath helper', () => {
    const output = renderTool(sifelyDescriptor).join('\n');
    expect(output).toContain(toolInvocationPath(sifelyDescriptor));
  });

  it('tracks the descriptor when the id changes (rename-safe, no hand-typing)', () => {
    const renamed: ToolDescriptor = { ...sifelyDescriptor, id: 'list-all-locks' };
    const output = renderTool(renamed).join('\n');
    expect(output).toContain('**Invocation**: `tsx /tools/sifely/list-all-locks.ts [flags]`');
    expect(output).not.toContain('list-locks.ts');
  });
});
