import { describe, it, expect, vi } from 'vitest';
import type { callLLM } from '../../../lib/call-llm.js';
import { ArchetypeGenerator, sanitizeAgentsMd } from '../archetype-generator.js';

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
    instructions:
      'Step 1: fetch data.\nStep 2: process.\nStep 3: compose the final digest message.',
    agents_md: [
      'You are a daily digest bot.',
      '',
      'WORKFLOW:',
      '1. Fetch data.',
      '2. Summarize.',
      '3. Compose the final digest message.',
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
    it('returns model from LLM response (no longer hardcoded)', async () => {
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent({ model: 'openai/gpt-4o' }));
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const result = await gen.generate('A daily Slack digest bot');
      expect(result.model).toBe('openai/gpt-4o');
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

    it('includes estimated_manual_minutes field in generate() result', async () => {
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent());
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const result = await gen.generate('A daily Slack digest bot');
      expect('estimated_manual_minutes' in result).toBe(true);
      expect(
        result.estimated_manual_minutes === null ||
          typeof result.estimated_manual_minutes === 'number',
      ).toBe(true);
    });

    it('estimation failure does not fail generate() — sets estimated_manual_minutes to null', async () => {
      const mockCallLLM = vi
        .fn()
        .mockResolvedValueOnce({
          content: makeValidJsonContent(),
          model: 'anthropic/claude-haiku-4-5',
          promptTokens: 10,
          completionTokens: 50,
          estimatedCostUsd: 0.001,
          latencyMs: 100,
        })
        .mockRejectedValueOnce(new Error('LLM unavailable'));
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const result = await gen.generate('A daily Slack digest bot');
      expect(result.estimated_manual_minutes).toBeNull();
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

    it('returns model from LLM response after refine (no longer hardcoded)', async () => {
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent({ model: 'openai/gpt-4o' }));
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      const previousConfig = JSON.parse(makeValidJsonContent()) as Parameters<typeof gen.refine>[0];
      const result = await gen.refine(previousConfig, 'Change the schedule to weekly');
      expect(result.model).toBe('openai/gpt-4o');
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

  describe('SYSTEM_PROMPT content', () => {
    it('does not teach output contract instructions in agents_md example', async () => {
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent());
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      await gen.generate('A daily Slack digest bot');
      const systemMessage = (
        mockCallLLM.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
      ).messages.find((m) => m.role === 'system');
      expect(systemMessage).toBeDefined();
      expect(systemMessage!.content).not.toMatch(/N\.\s+Write.*\/tmp\/summary\.txt/);
      expect(systemMessage!.content).not.toMatch(/OUTPUT FORMAT/);
      expect(systemMessage!.content).not.toContain(
        '/tmp/summary.txt and /tmp/approval-message.json paths',
      );
    });

    it('explicitly forbids output instructions in agents_md', async () => {
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent());
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      await gen.generate('A daily Slack digest bot');
      const systemMessage = (
        mockCallLLM.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
      ).messages.find((m) => m.role === 'system');
      expect(systemMessage).toBeDefined();
      const content = systemMessage!.content;
      const hasExclusionRule =
        (content.includes('platform') &&
          (content.includes('injects') || content.includes('handles'))) ||
        /DO NOT include.*output/i.test(content) ||
        /output.*platform.*runtime/i.test(content);
      expect(hasExclusionRule).toBe(true);
    });

    it('SYSTEM_PROMPT explicitly forbids CLASSIFICATION RULES section in agents_md', async () => {
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent());
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      await gen.generate('A daily Slack digest bot');
      const systemMessage = (
        mockCallLLM.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
      ).messages.find((m) => m.role === 'system');
      expect(systemMessage).toBeDefined();
      const content = systemMessage!.content;
      expect(content).not.toMatch(/^\s*\d+\.\s+\*\*CLASSIFICATION RULES/m);
      expect(content).toMatch(/Do NOT include.*CLASSIFICATION RULES/i);
    });

    it('SYSTEM_PROMPT explicitly forbids TOOLS AVAILABLE section in agents_md', async () => {
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent());
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      await gen.generate('A daily Slack digest bot');
      const systemMessage = (
        mockCallLLM.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
      ).messages.find((m) => m.role === 'system');
      expect(systemMessage).toBeDefined();
      const content = systemMessage!.content;
      expect(content).not.toMatch(/^\s*\d+\.\s+\*\*TOOLS AVAILABLE/m);
      expect(content).toMatch(/Do NOT include.*TOOLS AVAILABLE/i);
    });

    it('SYSTEM_PROMPT does not present APPROVED as a valid agent-facing classification', async () => {
      const mockCallLLM = makeCallLLMResult(makeValidJsonContent());
      const gen = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
      await gen.generate('A daily Slack digest bot');
      const systemMessage = (
        mockCallLLM.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
      ).messages.find((m) => m.role === 'system');
      expect(systemMessage).toBeDefined();
      const content = systemMessage!.content;
      expect(content).not.toMatch(/vs APPROVED/i);
      expect(content).not.toMatch(/use `APPROVED`/i);
    });
  });

  describe('sanitizeAgentsMd', () => {
    it('strips CLASSIFICATION RULES section while preserving WORKFLOW', () => {
      const input = [
        'You are a bot.',
        '',
        'WORKFLOW:',
        '1. Fetch data.',
        '2. Summarize.',
        '',
        'CLASSIFICATION RULES:',
        '- Write NO_ACTION_NEEDED if nothing.',
        '- Write NEEDS_APPROVAL if review needed.',
      ].join('\n');
      const result = sanitizeAgentsMd(input);
      expect(result).toMatch(/WORKFLOW/);
      expect(result).not.toMatch(/CLASSIFICATION RULES/i);
      expect(result).toContain('Fetch data');
    });

    it('strips TOOLS AVAILABLE TO YOU section while preserving WORKFLOW', () => {
      const input = [
        'You are a bot.',
        '',
        'WORKFLOW:',
        '1. Do the thing.',
        '',
        'TOOLS AVAILABLE TO YOU:',
        '- Slack: post message',
        '- Submit output tool',
      ].join('\n');
      const result = sanitizeAgentsMd(input);
      expect(result).toMatch(/WORKFLOW/);
      expect(result).not.toMatch(/TOOLS AVAILABLE/i);
      expect(result).toContain('Do the thing');
    });

    it('strips ## heading variants of forbidden sections', () => {
      const input = [
        'You are a bot.',
        '',
        'WORKFLOW:',
        '1. Fetch data.',
        '',
        '## Classification Rules',
        '- Use NO_ACTION_NEEDED if nothing.',
        '',
        '## Available Tools',
        '- /tools/slack/post-message.ts',
      ].join('\n');
      const result = sanitizeAgentsMd(input);
      expect(result).toMatch(/WORKFLOW/);
      expect(result).not.toMatch(/Classification Rules/i);
      expect(result).not.toMatch(/Available Tools/i);
    });

    it('preserves WORKFLOW and opening sentence after sanitizing all forbidden sections', () => {
      const input = [
        'You are a daily digest bot.',
        '',
        'WORKFLOW:',
        '1. Fetch data.',
        '2. Summarize.',
        '3. Post to Slack.',
        '',
        'CLASSIFICATION RULES:',
        '- Write NO_ACTION_NEEDED if nothing.',
        '',
        'TOOLS AVAILABLE TO YOU:',
        '- Slack: post message',
      ].join('\n');
      const result = sanitizeAgentsMd(input);
      expect(result).toContain('You are a daily digest bot.');
      expect(result).toMatch(/WORKFLOW/);
      expect(result).toContain('Fetch data');
      expect(result).not.toMatch(/CLASSIFICATION RULES/i);
      expect(result).not.toMatch(/TOOLS AVAILABLE/i);
    });

    it('returns original agents_md if sanitization would produce empty or whitespace-only string', () => {
      const input = [
        'CLASSIFICATION RULES:',
        '- Write NO_ACTION_NEEDED if nothing.',
        '',
        'TOOLS AVAILABLE TO YOU:',
        '- Slack: post message',
      ].join('\n');
      const result = sanitizeAgentsMd(input);
      expect(result.trim().length).toBeGreaterThan(0);
    });
  });
});
