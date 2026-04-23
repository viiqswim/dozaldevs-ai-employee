import { describe, expect, it } from 'vitest';
import { resolveAgentsMd } from '../../../src/workers/lib/agents-md-resolver.mjs';

describe('resolveAgentsMd', () => {
  it('Level 1 — returns archetype agents_md when present', () => {
    const result = resolveAgentsMd({ agents_md: 'archetype content' }, null);
    expect(result).toBe('archetype content');
  });

  it('Level 2 — falls back to tenant default_agents_md when archetype is null', () => {
    const result = resolveAgentsMd({ agents_md: null }, { default_agents_md: 'tenant content' });
    expect(result).toBe('tenant content');
  });

  it('Level 3 — returns null when both archetype and tenant are null', () => {
    const result = resolveAgentsMd({ agents_md: null }, { default_agents_md: null });
    expect(result).toBeNull();
  });

  it('Empty string fallthrough — archetype empty string falls through to tenant', () => {
    const result = resolveAgentsMd({ agents_md: '' }, { default_agents_md: 'tenant' });
    expect(result).toBe('tenant');
  });

  it('Whitespace-only fallthrough — archetype whitespace falls through to tenant', () => {
    const result = resolveAgentsMd({ agents_md: '   ' }, { default_agents_md: 'tenant' });
    expect(result).toBe('tenant');
  });

  it('Null archetype object — falls back to tenant default', () => {
    const result = resolveAgentsMd(null, { default_agents_md: 'tenant' });
    expect(result).toBe('tenant');
  });

  it('Null tenantConfig — returns null when archetype has no agents_md', () => {
    const result = resolveAgentsMd({ agents_md: null }, null);
    expect(result).toBeNull();
  });

  it('Tenant empty string — returns null when tenant default_agents_md is empty', () => {
    const result = resolveAgentsMd(null, { default_agents_md: '' });
    expect(result).toBeNull();
  });

  it('Priority — archetype wins over tenant when both are present', () => {
    const result = resolveAgentsMd({ agents_md: 'archetype' }, { default_agents_md: 'tenant' });
    expect(result).toBe('archetype');
  });
});
