import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockWarn = vi.hoisted(() => vi.fn());
const mockInfo = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/logger.js', () => ({
  createLogger: () => ({ warn: mockWarn, info: mockInfo, error: vi.fn() }),
}));

vi.mock('../../src/lib/output-contract-constants.js', () => ({
  EXECUTION_PROMPT: 'EXEC_PROMPT',
  APPROVAL_MESSAGE_PATH: '/tmp/approval-message.json',
  DELIVERY_PHASE_VALUE: 'delivery',
}));
vi.mock('../../src/workers/lib/postgrest-client.js', () => ({ createPostgRESTClient: vi.fn() }));
vi.mock('../../src/workers/lib/agents-md-compiler.mjs', () => ({
  compileAgentsMd: vi.fn(),
  loadConnectedToolkits: vi.fn(),
}));
vi.mock('../../src/workers/lib/failure-codes.js', () => ({ classifyFailure: vi.fn() }));
vi.mock('../../src/workers/lib/template-vars.js', () => ({
  buildTemplateVars: vi.fn(),
  substituteTemplateVars: vi.fn((s) => s),
}));
vi.mock('../../src/workers/lib/prompt-assembler.mjs', () => ({ assembleTaskPrompt: vi.fn() }));
vi.mock('../../src/workers/lib/trigger-payload.mjs', () => ({
  injectAssignmentSection: vi.fn((s) => s),
}));
vi.mock('../../src/workers/lib/harness-helpers.mjs', () => ({
  markFailed: vi.fn(),
  fireCompletionEvent: vi.fn(),
  writeOpencodeAuth: vi.fn(),
  filterComposioSkills: vi.fn(),
}));
vi.mock('../../src/workers/lib/heartbeat.js', () => ({ startHeartbeat: vi.fn() }));

import { isToolAllowed } from '../../src/workers/lib/execution-phase.mjs';
import type { ArchetypeRow } from '../../src/workers/lib/execution-phase.mjs';

function makeArchetype(overrides = {}) {
  const base = {
    id: 'arch-test-001',
    model: 'deepseek/deepseek-v4-flash',
    tool_registry: {
      tools: ['/tools/platform/submit-output.ts', '/tools/slack/post-message.ts'],
    },
    enforce_tool_registry: false,
  };
  return { ...base, ...overrides } as ArchetypeRow;
}

describe('isToolAllowed — tool registry capability enforcement', () => {
  beforeEach(() => {
    mockWarn.mockClear();
    mockInfo.mockClear();
  });

  describe('Test 1: flag ON, tool IN registry => allowed', () => {
    it('returns true without logging a warning', () => {
      const archetype = makeArchetype({ enforce_tool_registry: true });
      const result = isToolAllowed('/tools/platform/submit-output.ts', archetype);
      expect(result).toBe(true);
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('allows any path present in the tools array', () => {
      const archetype = makeArchetype({ enforce_tool_registry: true });
      const result = isToolAllowed('/tools/slack/post-message.ts', archetype);
      expect(result).toBe(true);
      expect(mockWarn).not.toHaveBeenCalled();
    });
  });

  describe('Test 2: flag ON, tool NOT in registry => denied + logged', () => {
    it('returns false for a tool absent from the registry', () => {
      const archetype = makeArchetype({ enforce_tool_registry: true });
      const result = isToolAllowed('/tools/hostfully/get-messages.ts', archetype);
      expect(result).toBe(false);
    });

    it('logs warn with toolPath and archetypeId when denied', () => {
      const archetype = makeArchetype({ enforce_tool_registry: true });
      isToolAllowed('/tools/hostfully/get-messages.ts', archetype);
      expect(mockWarn).toHaveBeenCalledOnce();
      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          archetypeId: 'arch-test-001',
          toolPath: '/tools/hostfully/get-messages.ts',
        }),
        'Tool denied by capability enforcement',
      );
    });

    it('denies all tools when registry is empty', () => {
      const archetype = makeArchetype({
        enforce_tool_registry: true,
        tool_registry: { tools: [] },
      });
      const result = isToolAllowed('/tools/platform/submit-output.ts', archetype);
      expect(result).toBe(false);
      expect(mockWarn).toHaveBeenCalledOnce();
    });

    it('denies all tools when tool_registry is null', () => {
      const archetype = makeArchetype({
        enforce_tool_registry: true,
        tool_registry: null,
      });
      const result = isToolAllowed('/tools/platform/submit-output.ts', archetype);
      expect(result).toBe(false);
      expect(mockWarn).toHaveBeenCalledOnce();
    });
  });

  describe('Test 3: flag OFF => all tools available, no filtering', () => {
    it('flag false allows any tool regardless of registry', () => {
      const archetype = makeArchetype({
        enforce_tool_registry: false,
        tool_registry: { tools: ['/tools/platform/submit-output.ts'] },
      });
      const result = isToolAllowed('/tools/hostfully/get-messages.ts', archetype);
      expect(result).toBe(true);
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('flag null allows any tool', () => {
      const archetype = makeArchetype({ enforce_tool_registry: null });
      const result = isToolAllowed('/tools/anything.ts', archetype);
      expect(result).toBe(true);
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('flag undefined allows any tool', () => {
      const archetype = makeArchetype({ enforce_tool_registry: undefined });
      const result = isToolAllowed('/tools/sifely/list-locks.ts', archetype);
      expect(result).toBe(true);
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('flag false with null registry allows tool without warning', () => {
      const archetype = makeArchetype({
        enforce_tool_registry: false,
        tool_registry: null,
      });
      isToolAllowed('/tools/platform/submit-output.ts', archetype);
      expect(mockWarn).not.toHaveBeenCalled();
    });
  });

  // Tripwire: enforcement is a raw Set.has() exact-match — it must NEVER normalize.
  // If a future change leaks resolveToolPaths() (bare→/tools/*.ts, tsx-strip) into
  // this path, these near-miss variants of a LISTED tool would wrongly pass.
  describe('Test 4: exact-match semantics — near-miss variants of a listed tool are denied', () => {
    it('denies the bare service/tool form of a registry-listed path', () => {
      const archetype = makeArchetype({ enforce_tool_registry: true });
      expect(isToolAllowed('slack/post-message', archetype)).toBe(false);
      expect(mockWarn).toHaveBeenCalledOnce();
    });

    it('denies a tsx-prefixed form of a registry-listed path', () => {
      const archetype = makeArchetype({ enforce_tool_registry: true });
      expect(isToolAllowed('tsx /tools/slack/post-message.ts', archetype)).toBe(false);
      expect(mockWarn).toHaveBeenCalledOnce();
    });

    it('denies a registry-listed path missing its .ts extension', () => {
      const archetype = makeArchetype({ enforce_tool_registry: true });
      expect(isToolAllowed('/tools/slack/post-message', archetype)).toBe(false);
      expect(mockWarn).toHaveBeenCalledOnce();
    });

    it('allows only the byte-identical listed path', () => {
      const archetype = makeArchetype({ enforce_tool_registry: true });
      expect(isToolAllowed('/tools/slack/post-message.ts', archetype)).toBe(true);
      expect(mockWarn).not.toHaveBeenCalled();
    });
  });
});
