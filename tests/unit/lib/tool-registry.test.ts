import { describe, it, expect } from 'vitest';
import {
  ALL_TOOL_DESCRIPTORS,
  toolInvocationPath,
  type ToolDescriptor,
} from '../../../src/lib/tool-registry.js';

describe('toolInvocationPath', () => {
  it('derives tsx /tools/<service>/<id>.ts from a descriptor', () => {
    expect(toolInvocationPath({ service: 'sifely', id: 'list-locks' })).toBe(
      'tsx /tools/sifely/list-locks.ts',
    );
  });

  it('tracks the descriptor when the id changes', () => {
    expect(toolInvocationPath({ service: 'sifely', id: 'rotate-property-code' })).toBe(
      'tsx /tools/sifely/rotate-property-code.ts',
    );
  });

  it('tracks the descriptor when the service changes', () => {
    expect(toolInvocationPath({ service: 'platform', id: 'submit-output' })).toBe(
      'tsx /tools/platform/submit-output.ts',
    );
  });

  it('preserves the knowledge_base snake_case service segment (matches container path)', () => {
    expect(toolInvocationPath({ service: 'knowledge_base', id: 'search' })).toBe(
      'tsx /tools/knowledge_base/search.ts',
    );
  });

  it('renders a unique invocation path for every registry descriptor', () => {
    const paths = ALL_TOOL_DESCRIPTORS.map((d: ToolDescriptor) => toolInvocationPath(d));
    expect(new Set(paths).size).toBe(ALL_TOOL_DESCRIPTORS.length);
    for (const p of paths) {
      expect(p).toMatch(/^tsx \/tools\/[a-z0-9_]+\/[a-z0-9-]+\.ts$/);
    }
  });
});
