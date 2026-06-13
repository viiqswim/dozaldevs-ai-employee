import { describe, expect, it } from 'vitest';
import { discoverTools } from '../../src/gateway/services/tool-parser.js';
import { ALL_TOOL_DESCRIPTORS } from '../../src/lib/tool-registry.js';

const EXPECTED_TOOL_IDS = [
  'post-message',
  'read-channels',
  'post-guest-approval',
  'submit-output',
  'report-issue',
  'calculate',
  'get-token',
  'search',
  'execute',
  'list-actions',
  'get-messages',
  'send-message',
  'get-properties',
  'get-property',
  'get-reservations',
  'get-reviews',
  'get-door-code',
  'update-door-code',
  'get-checkouts',
  'register-webhook',
  'validate-env',
  'list-locks',
  'create-passcode',
  'delete-passcode',
  'list-passcodes',
  'update-passcode',
  'list-access-records',
  'diagnose-access',
  'generate-code',
  'rotate-property-code',
] as const;

describe('ALL_TOOL_DESCRIPTORS registry', () => {
  it('contains all expected tool ids', () => {
    const ids = new Set(ALL_TOOL_DESCRIPTORS.map((d) => d.id));
    for (const expected of EXPECTED_TOOL_IDS) {
      expect(ids.has(expected), `registry missing tool: ${expected}`).toBe(true);
    }
  });

  it('all descriptor ids are unique', () => {
    const ids = ALL_TOOL_DESCRIPTORS.map((d) => d.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every descriptor has a non-empty description', () => {
    for (const d of ALL_TOOL_DESCRIPTORS) {
      expect(d.description.trim().length, `${d.id} has empty description`).toBeGreaterThan(0);
    }
  });

  it('every descriptor has a non-empty service', () => {
    for (const d of ALL_TOOL_DESCRIPTORS) {
      expect(d.service.trim().length, `${d.id} has empty service`).toBeGreaterThan(0);
    }
  });

  it('every descriptor has an envVars array', () => {
    for (const d of ALL_TOOL_DESCRIPTORS) {
      expect(Array.isArray(d.envVars), `${d.id} envVars is not an array`).toBe(true);
    }
  });

  it('every descriptor has an args array', () => {
    for (const d of ALL_TOOL_DESCRIPTORS) {
      expect(Array.isArray(d.args), `${d.id} args is not an array`).toBe(true);
    }
  });
});

describe('discoverTools startup cache', () => {
  it('returns a non-empty array', async () => {
    const tools = await discoverTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  it('returns the same reference on second call (cache hit)', async () => {
    const first = await discoverTools();
    const second = await discoverTools();
    expect(first).toBe(second);
  });

  it('catalog contains all expected tool ids', async () => {
    const tools = await discoverTools();
    const ids = new Set(tools.map((t) => t.name));
    for (const expected of EXPECTED_TOOL_IDS) {
      expect(ids.has(expected), `catalog missing tool: ${expected}`).toBe(true);
    }
  });

  it('every tool has a containerPath starting with /tools/', async () => {
    const tools = await discoverTools();
    for (const tool of tools) {
      expect(tool.containerPath, `${tool.name} bad containerPath`).toMatch(/^\/tools\//);
    }
  });

  it('catalog size matches registry size', async () => {
    const tools = await discoverTools();
    expect(tools.length).toBe(ALL_TOOL_DESCRIPTORS.length);
  });
});
