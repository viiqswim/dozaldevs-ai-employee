import { describe, expect, it } from 'vitest';
import { resolveAgentsMd } from '../../../src/workers/lib/agents-md-resolver.mjs';

describe('resolveAgentsMd', () => {
  it('All three levels present — output contains all three headers and contents in correct order', () => {
    const result = resolveAgentsMd(
      'platform text',
      { default_agents_md: 'tenant text' },
      { agents_md: 'archetype text' },
    );
    expect(result).toContain('# Platform Policy');
    expect(result).toContain('# Tenant Conventions');
    expect(result).toContain('# Employee Instructions');
    expect(result).toContain('platform text');
    expect(result).toContain('tenant text');
    expect(result).toContain('archetype text');
  });

  it('Platform only — tenantConfig null, archetype null — output is platform section only', () => {
    const result = resolveAgentsMd('platform text', null, null);
    expect(result).toBe('# Platform Policy\n\nplatform text');
  });

  it('Platform + tenant — archetype null — has Platform and Tenant headers, no Employee Instructions', () => {
    const result = resolveAgentsMd('platform text', { default_agents_md: 'tenant text' }, null);
    expect(result).toContain('# Platform Policy');
    expect(result).toContain('# Tenant Conventions');
    expect(result).not.toContain('# Employee Instructions');
  });

  it('Platform + archetype — tenantConfig null — has Platform and Employee Instructions headers, no Tenant Conventions', () => {
    const result = resolveAgentsMd('platform text', null, { agents_md: 'archetype text' });
    expect(result).toContain('# Platform Policy');
    expect(result).toContain('# Employee Instructions');
    expect(result).not.toContain('# Tenant Conventions');
  });

  it('Empty string tenant — Tenant section omitted', () => {
    const result = resolveAgentsMd(
      'platform text',
      { default_agents_md: '' },
      { agents_md: 'archetype text' },
    );
    expect(result).not.toContain('# Tenant Conventions');
    expect(result).toContain('# Platform Policy');
    expect(result).toContain('# Employee Instructions');
  });

  it('Whitespace-only tenant — Tenant section omitted', () => {
    const result = resolveAgentsMd(
      'platform text',
      { default_agents_md: '   \n  ' },
      { agents_md: 'archetype text' },
    );
    expect(result).not.toContain('# Tenant Conventions');
    expect(result).toContain('# Platform Policy');
    expect(result).toContain('# Employee Instructions');
  });

  it('Empty string archetype — Employee Instructions section omitted', () => {
    const result = resolveAgentsMd(
      'platform text',
      { default_agents_md: 'tenant text' },
      { agents_md: '' },
    );
    expect(result).not.toContain('# Employee Instructions');
    expect(result).toContain('# Platform Policy');
    expect(result).toContain('# Tenant Conventions');
  });

  it('Whitespace-only archetype — Employee Instructions section omitted', () => {
    const result = resolveAgentsMd(
      'platform text',
      { default_agents_md: 'tenant text' },
      { agents_md: '   ' },
    );
    expect(result).not.toContain('# Employee Instructions');
    expect(result).toContain('# Platform Policy');
    expect(result).toContain('# Tenant Conventions');
  });

  it('Null archetype object — only Platform section', () => {
    const result = resolveAgentsMd('platform text', null, null);
    expect(result).toContain('# Platform Policy');
    expect(result).not.toContain('# Tenant Conventions');
    expect(result).not.toContain('# Employee Instructions');
  });

  it('Null tenantConfig — only Platform section (no tenant or archetype)', () => {
    const result = resolveAgentsMd('platform text', null, null);
    expect(result).toContain('# Platform Policy');
    expect(result).not.toContain('# Tenant Conventions');
    expect(result).not.toContain('# Employee Instructions');
  });

  it('Platform content always appears first — correct ordering of all three sections', () => {
    const result = resolveAgentsMd(
      'platform text',
      { default_agents_md: 'tenant text' },
      { agents_md: 'archetype text' },
    );
    const platformIdx = result.indexOf('# Platform Policy');
    const tenantIdx = result.indexOf('# Tenant Conventions');
    const archetypeIdx = result.indexOf('# Employee Instructions');
    expect(platformIdx).toBeLessThan(tenantIdx);
    expect(tenantIdx).toBeLessThan(archetypeIdx);
  });

  it('Snapshot test — exact output matches expected string for fixed inputs', () => {
    const result = resolveAgentsMd(
      'platform text',
      { default_agents_md: 'tenant text' },
      { agents_md: 'archetype text' },
    );
    expect(result).toBe(
      '# Platform Policy\n\nplatform text\n\n# Tenant Conventions\n\ntenant text\n\n# Employee Instructions\n\narchetype text',
    );
  });

  it('Custom archetype still includes platform — output contains both platformContent and archetype content', () => {
    const result = resolveAgentsMd('security policy content', null, {
      agents_md: 'custom archetype instructions',
    });
    expect(result).toContain('security policy content');
    expect(result).toContain('custom archetype instructions');
  });

  it('platformRuntimeSections provided — output includes "# Platform Runtime Context" section', () => {
    const result = resolveAgentsMd('platform text', null, null, undefined, undefined, [
      'runtime section A',
    ]);
    expect(result).toContain('# Platform Runtime Context');
    expect(result).toContain('runtime section A');
  });

  it('platformRuntimeSections with multiple entries — all entries joined in output', () => {
    const result = resolveAgentsMd('platform text', null, null, undefined, undefined, [
      'section one',
      'section two',
    ]);
    expect(result).toContain('section one');
    expect(result).toContain('section two');
  });

  it('platformRuntimeSections undefined — output does NOT include "# Platform Runtime Context"', () => {
    const result = resolveAgentsMd('platform text', null, null);
    expect(result).not.toContain('# Platform Runtime Context');
  });

  it('platformRuntimeSections empty array — output does NOT include "# Platform Runtime Context"', () => {
    const result = resolveAgentsMd('platform text', null, null, undefined, undefined, []);
    expect(result).not.toContain('# Platform Runtime Context');
  });

  it('platformRuntimeSections appears after Platform Policy and before Tenant Conventions', () => {
    const result = resolveAgentsMd(
      'platform text',
      { default_agents_md: 'tenant text' },
      null,
      undefined,
      undefined,
      ['runtime section'],
    );
    const platformIdx = result.indexOf('# Platform Policy');
    const runtimeIdx = result.indexOf('# Platform Runtime Context');
    const tenantIdx = result.indexOf('# Tenant Conventions');
    expect(platformIdx).toBeLessThan(runtimeIdx);
    expect(runtimeIdx).toBeLessThan(tenantIdx);
  });

  it('platformRuntimeSections snapshot — exact output matches expected string', () => {
    const result = resolveAgentsMd('platform text', null, null, undefined, undefined, [
      'runtime info',
    ]);
    expect(result).toBe(
      '# Platform Policy\n\nplatform text\n\n# Platform Runtime Context\n\nruntime info',
    );
  });

  it('closingSections are appended after employee knowledge as # Final Reminders', () => {
    const result = resolveAgentsMd(
      'platform text',
      null,
      null,
      undefined,
      'knowledge content',
      undefined,
      ['closing reminder'],
    );
    expect(result).toContain('# Final Reminders');
    expect(result).toContain('closing reminder');
    const knowledgeIdx = result.indexOf('# Employee Knowledge');
    const closingIdx = result.indexOf('# Final Reminders');
    expect(knowledgeIdx).toBeLessThan(closingIdx);
  });

  it('closingSections are omitted when not provided', () => {
    const result = resolveAgentsMd('platform text', null, null);
    expect(result).not.toContain('# Final Reminders');
  });

  it('closingSections with multiple items are joined with double newline', () => {
    const result = resolveAgentsMd('platform text', null, null, undefined, undefined, undefined, [
      'first reminder',
      'second reminder',
    ]);
    expect(result).toContain('# Final Reminders');
    expect(result).toContain('first reminder');
    expect(result).toContain('second reminder');
    expect(result).toMatch(/first reminder\n\nsecond reminder/);
  });
});
