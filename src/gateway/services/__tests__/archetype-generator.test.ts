import { describe, it, expect, vi } from 'vitest';
import type { callLLM } from '../../../lib/call-llm.js';
import { ArchetypeGenerator } from '../archetype-generator.js';

type MockCallLLM = ReturnType<typeof vi.fn>;

function makeCallLLMResult(content: string): MockCallLLM {
  return vi.fn().mockResolvedValue({
    content,
    model: 'anthropic/claude-haiku-4-5',
    promptTokens: 10,
    completionTokens: 50,
    estimatedCostUsd: 0.001,
    latencyMs: 100,
  });
}

function makeValidJsonContent(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    role_name: 'daily-slack-digest',
    model: 'minimax/minimax-m2.7',
    runtime: 'opencode',
    system_prompt: '',
    instructions: 'Step 1: fetch data.\nStep 2: process.\nStep 3: write to /tmp/summary.txt',
    agents_md: [
      'You are a daily digest bot.',
      '',
      'WORKFLOW:',
      '1. Fetch data.',
      '2. Summarize.',
      'N. Write results to /tmp/summary.txt',
      '',
      'CLASSIFICATION RULES:',
      '- Write NO_ACTION_NEEDED if no data.',
      '',
      'OUTPUT FORMAT:',
      'Write to /tmp/summary.txt: { "classification": "..." }',
      '',
      'TOOLS AVAILABLE TO YOU:',
      '- Slack: post message',
    ].join('\n'),
    delivery_instructions: null,
    deliverable_type: 'slack_message',
    risk_model: { approval_required: true, timeout_hours: 24 },
    trigger_sources: { type: 'manual' },
    tool_registry: { tools: ['/tools/slack/post-message.ts'] },
    concurrency_limit: 3,
    ...overrides,
  });
}

describe('ArchetypeGenerator', () => {
  describe('generate()', () => {
    it('returns model hardcoded to minimax/minimax-m2.7 regardless of LLM response', async () => {
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent({ model: 'openai/gpt-4o' }));
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const result = await gen.generate('A daily Slack digest bot');
      expect(result.model).toBe('minimax/minimax-m2.7');
    });

    it('returns runtime hardcoded to opencode regardless of LLM response', async () => {
      const mockCallLLM = makeCallLLMResult(
        makeValidJsonContent({ runtime: 'some-other-runtime' }),
      );
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const result = await gen.generate('A daily Slack digest bot');
      expect(result.runtime).toBe('opencode');
    });

    it('returns system_prompt hardcoded to empty string regardless of LLM response', async () => {
      const mockCallLLM = makeCallLLMResult(
        makeValidJsonContent({ system_prompt: 'You are a helpful assistant' }),
      );
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const result = await gen.generate('A daily Slack digest bot');
      expect(result.system_prompt).toBe('');
    });

    it('converts human-readable role_name to kebab-case slug', async () => {
      const mockCallLLM = makeCallLLMResult(
        makeValidJsonContent({ role_name: 'Daily Slack Digest' }),
      );
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const result = await gen.generate('A daily Slack digest bot');
      expect(result.role_name).toBe('daily-slack-digest');
    });

    it('valid JSON response produces a valid slug role_name', async () => {
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent());
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const result = await gen.generate('A daily Slack digest bot');
      expect(result.role_name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });

    it('throws GENERATION_FAILED when LLM returns non-JSON content', async () => {
      const mockCallLLM = makeCallLLMResult('This is not JSON at all');
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      await expect(gen.generate('A daily Slack digest bot')).rejects.toThrow('GENERATION_FAILED');
    });

    it('strips markdown fences before parsing — valid fenced JSON succeeds', async () => {
      const fencedJson = '```json\n' + makeValidJsonContent() + '\n```';
      const mockCallLLM = makeCallLLMResult(fencedJson);
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const result = await gen.generate('A daily Slack digest bot');
      expect(result.model).toBe('minimax/minimax-m2.7');
      expect(result.runtime).toBe('opencode');
    });
  });

  describe('overview field (postProcess)', () => {
    it('preserves overview with all 6 keys when LLM response includes a valid overview', async () => {
      const overview = {
        role: 'A bot that digests Slack channels daily',
        trigger: 'Runs every morning at 8am UTC on weekdays',
        workflow: ['Fetch messages from channels', 'Summarize with AI', 'Post digest to Slack'],
        tools_used: 'Slack API for reading channels and posting messages',
        output: 'Daily digest message posted in a Slack channel',
        approval: 'Requires PM approval before posting',
      };
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent({ overview }));
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const result = await gen.generate('A daily Slack digest bot');
      expect(result.overview).toEqual(overview);
      expect(Object.keys(result.overview)).toHaveLength(6);
      expect(Object.keys(result.overview)).toEqual(
        expect.arrayContaining(['role', 'trigger', 'workflow', 'tools_used', 'output', 'approval']),
      );
    });

    it('sets fallback overview with empty values when LLM response is missing overview', async () => {
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent());
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const result = await gen.generate('A daily Slack digest bot');
      expect(result.overview).toEqual({
        role: '',
        trigger: '',
        workflow: [],
        tools_used: '',
        output: '',
        approval: '',
      });
    });

    it('sets fallback overview when LLM response has overview as a non-object (e.g. string)', async () => {
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent({ overview: 'not an object' }));
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const result = await gen.generate('A daily Slack digest bot');
      expect(result.overview).toEqual({
        role: '',
        trigger: '',
        workflow: [],
        tools_used: '',
        output: '',
        approval: '',
      });
    });
  });

  describe('refine()', () => {
    it('calls LLM with the previous config JSON serialised in the user message', async () => {
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent());
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const previousConfig = JSON.parse(makeValidJsonContent()) as Parameters<typeof gen.refine>[0];
      await gen.refine(previousConfig, 'Add a second Slack channel output');
      expect(mockCallLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining(JSON.stringify(previousConfig, null, 2)),
            }),
          ]),
        }),
      );
    });

    it('returns model hardcoded to minimax/minimax-m2.7 after refine', async () => {
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent({ model: 'openai/gpt-4o' }));
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const previousConfig = JSON.parse(makeValidJsonContent()) as Parameters<typeof gen.refine>[0];
      const result = await gen.refine(previousConfig, 'Change the schedule to weekly');
      expect(result.model).toBe('minimax/minimax-m2.7');
    });

    it('throws GENERATION_FAILED when LLM returns invalid JSON during refine', async () => {
      const mockCallLLM = makeCallLLMResult('Not valid JSON at all');
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const previousConfig = JSON.parse(makeValidJsonContent()) as Parameters<typeof gen.refine>[0];
      await expect(gen.refine(previousConfig, 'Change something')).rejects.toThrow(
        'GENERATION_FAILED',
      );
    });
  });
});
