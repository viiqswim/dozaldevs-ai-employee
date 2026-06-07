import { describe, it, expect, vi } from 'vitest';
import type { callLLM } from '../../../lib/call-llm.js';
import {
  ArchetypeGenerator,
  isCodeWritingEmployee,
  CODE_EMPLOYEE_PLATFORM_RULES_OVERRIDE,
} from '../archetype-generator.js';

function makeLLMResult(json: object): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    content: JSON.stringify(json),
    model: 'deepseek/deepseek-v4-flash',
    promptTokens: 10,
    completionTokens: 50,
    estimatedCostUsd: 0.0001,
    latencyMs: 50,
  });
}

function makeLLMResultRaw(content: string): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    content,
    model: 'deepseek/deepseek-v4-flash',
    promptTokens: 10,
    completionTokens: 50,
    estimatedCostUsd: 0.0001,
    latencyMs: 50,
  });
}

const BASE_RESPONSE = {
  role_name: 'test-employee',
  model: 'minimax/minimax-m2.7',
  runtime: 'opencode',
  identity: 'You are a test employee.',
  execution_steps: '1. Do the thing.\n2. Submit output.',
  delivery_steps: null,
  delivery_instructions: null,
  deliverable_type: 'slack_message',
  risk_model: { approval_required: false, timeout_hours: 2 },
  trigger_sources: { type: 'manual' },
  tool_registry: { tools: ['/tools/platform/submit-output.ts'] },
  concurrency_limit: 3,
  overview: {
    role: 'A test employee',
    trigger: 'Manual',
    workflow: ['Step 1'],
    tools_used: 'None',
    output: 'A message',
    approval: 'No',
  },
};

describe('isCodeWritingEmployee()', () => {
  it('returns true for descriptions containing "code"', () => {
    expect(isCodeWritingEmployee('Write code to fix the issue')).toBe(true);
  });

  it('returns true for descriptions containing "github"', () => {
    expect(isCodeWritingEmployee('Push changes to GitHub')).toBe(true);
  });

  it('returns true for descriptions containing "repository"', () => {
    expect(isCodeWritingEmployee('Clone the repository and make changes')).toBe(true);
  });

  it('returns true for descriptions containing "repo"', () => {
    expect(isCodeWritingEmployee('Check the repo for open issues')).toBe(true);
  });

  it('returns true for descriptions containing "pull request"', () => {
    expect(isCodeWritingEmployee('Open a pull request with the fix')).toBe(true);
  });

  it('returns true for descriptions containing "pull request"', () => {
    expect(isCodeWritingEmployee('Create a pull request for the feature')).toBe(true);
  });

  it('returns true for descriptions containing "bug fix"', () => {
    expect(isCodeWritingEmployee('Automated bug fix employee')).toBe(true);
  });

  it('returns true for descriptions containing "commit"', () => {
    expect(isCodeWritingEmployee('Commit the changes to main')).toBe(true);
  });

  it('returns true for descriptions containing "branch"', () => {
    expect(isCodeWritingEmployee('Create a branch for each task')).toBe(true);
  });

  it('returns true for descriptions containing "implement"', () => {
    expect(isCodeWritingEmployee('Implement the feature from Jira ticket')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isCodeWritingEmployee('GITHUB repository CODE')).toBe(true);
  });

  it('returns false for a Slack digest description', () => {
    expect(isCodeWritingEmployee('Daily Slack digest of channel activity')).toBe(false);
  });

  it('returns false for a guest messaging description', () => {
    expect(isCodeWritingEmployee('Reply to Hostfully guest messages with a helpful response')).toBe(
      false,
    );
  });

  it('returns false for a lock rotation description', () => {
    expect(isCodeWritingEmployee('Rotate Sifely door lock PINs for all properties weekly')).toBe(
      false,
    );
  });

  it('returns false for an empty description', () => {
    expect(isCodeWritingEmployee('')).toBe(false);
  });
});

describe('ArchetypeGenerator — code-writing detection', () => {
  it('applies code overrides when description mentions GitHub', async () => {
    const mockCallLLM = makeLLMResult(BASE_RESPONSE);
    const generator = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
    const result = await generator.generate(
      'An employee that receives Jira tickets and creates GitHub pull requests',
    );

    expect(result.concurrency_limit).toBe(1);
    expect(result.vm_size).toBe('performance-1x');
    expect(result.platform_rules_override).toBe(CODE_EMPLOYEE_PLATFORM_RULES_OVERRIDE);
    expect(result.risk_model.approval_required).toBe(true);
    expect(result.worker_env).toEqual({ GITHUB_REPO_URL: '' });
    expect(result.tool_registry.tools).toContain('/tools/github/get-token.ts');
  });

  it('applies code overrides when description mentions repository and code', async () => {
    const mockCallLLM = makeLLMResult(BASE_RESPONSE);
    const generator = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
    const result = await generator.generate(
      'Employee that clones the repository, implements bug fixes, and commits code',
    );

    expect(result.concurrency_limit).toBe(1);
    expect(result.vm_size).toBe('performance-1x');
    expect(result.platform_rules_override).toBe(CODE_EMPLOYEE_PLATFORM_RULES_OVERRIDE);
    expect(result.risk_model.approval_required).toBe(true);
    expect(result.worker_env).toEqual(expect.objectContaining({ GITHUB_REPO_URL: '' }));
    expect(result.tool_registry.tools).toContain('/tools/github/get-token.ts');
  });

  it('does NOT add github tool if already present in LLM response', async () => {
    const responseWithGithubTool = {
      ...BASE_RESPONSE,
      tool_registry: {
        tools: ['/tools/platform/submit-output.ts', '/tools/github/get-token.ts'],
      },
    };
    const mockCallLLM = makeLLMResult(responseWithGithubTool);
    const generator = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
    const result = await generator.generate('Implement features from GitHub issues');

    const githubToolOccurrences = result.tool_registry.tools.filter(
      (t) => t === '/tools/github/get-token.ts',
    );
    expect(githubToolOccurrences).toHaveLength(1);
  });

  it('does NOT apply code overrides for a non-code description', async () => {
    const mockCallLLM = makeLLMResult(BASE_RESPONSE);
    const generator = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
    const result = await generator.generate('Daily Slack digest of team activity with a summary');

    expect(result.concurrency_limit).toBe(3);
    expect(result.vm_size).toBeUndefined();
    expect(result.platform_rules_override).toBeUndefined();
    expect(result.worker_env).toBeUndefined();
    expect(result.tool_registry.tools).not.toContain('/tools/github/get-token.ts');
  });

  it('does NOT apply code overrides for a guest messaging description', async () => {
    const mockCallLLM = makeLLMResult(BASE_RESPONSE);
    const generator = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
    const result = await generator.generate(
      'Reply to Hostfully guest messages about check-in information',
    );

    expect(result.concurrency_limit).toBe(3);
    expect(result.platform_rules_override).toBeUndefined();
    expect(result.tool_registry.tools).not.toContain('/tools/github/get-token.ts');
  });

  it('preserves existing worker_env keys when adding GITHUB_REPO_URL', async () => {
    const responseWithWorkerEnv = {
      ...BASE_RESPONSE,
      worker_env: { SOME_EXISTING_KEY: 'some-value' },
    };
    const mockCallLLM = makeLLMResult(responseWithWorkerEnv);
    const generator = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
    const result = await generator.generate('Employee that writes code and commits to GitHub');

    expect(result.worker_env).toEqual(
      expect.objectContaining({ SOME_EXISTING_KEY: 'some-value', GITHUB_REPO_URL: '' }),
    );
  });

  it('forces approval_required to true even when LLM sets it false', async () => {
    const responseWithNoApproval = {
      ...BASE_RESPONSE,
      risk_model: { approval_required: false, timeout_hours: 2 },
    };
    const mockCallLLM = makeLLMResult(responseWithNoApproval);
    const generator = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
    const result = await generator.generate('Write code and submit pull requests to GitHub');

    expect(result.risk_model.approval_required).toBe(true);
  });
});

describe('ArchetypeGenerator — JSON parse retry', () => {
  it('no-retry path: succeeds on first attempt when LLM returns valid JSON', async () => {
    const mockCallLLM = makeLLMResult(BASE_RESPONSE);
    const generator = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
    const result = await generator.generate('Daily Slack digest of team activity');

    expect(result.role_name).toBe('test-employee');
    expect(mockCallLLM).toHaveBeenCalledTimes(2);
  });

  it('retry-success path: succeeds on second attempt when first response is invalid JSON', async () => {
    const validJson = JSON.stringify(BASE_RESPONSE);
    const mockCallLLM = vi
      .fn()
      .mockResolvedValueOnce({
        content: 'not valid json at all {{{',
        model: 'deepseek/deepseek-v4-flash',
        promptTokens: 10,
        completionTokens: 50,
        estimatedCostUsd: 0.0001,
        latencyMs: 50,
      })
      .mockResolvedValueOnce({
        content: validJson,
        model: 'deepseek/deepseek-v4-flash',
        promptTokens: 10,
        completionTokens: 50,
        estimatedCostUsd: 0.0001,
        latencyMs: 50,
      })
      .mockResolvedValue({
        content: validJson,
        model: 'deepseek/deepseek-v4-flash',
        promptTokens: 10,
        completionTokens: 50,
        estimatedCostUsd: 0.0001,
        latencyMs: 50,
      });

    const generator = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
    const result = await generator.generate('Daily Slack digest of team activity');

    expect(result.role_name).toBe('test-employee');
    expect(mockCallLLM).toHaveBeenCalledTimes(3);
  });

  it('retry-fail path: throws GENERATION_FAILED when both attempts return invalid JSON', async () => {
    const mockCallLLM = vi.fn().mockResolvedValue({
      content: 'not valid json {{{',
      model: 'deepseek/deepseek-v4-flash',
      promptTokens: 10,
      completionTokens: 50,
      estimatedCostUsd: 0.0001,
      latencyMs: 50,
    });

    const generator = new ArchetypeGenerator(mockCallLLM as typeof callLLM);

    await expect(generator.generate('Daily Slack digest of team activity')).rejects.toThrow(
      'GENERATION_FAILED',
    );
    expect(mockCallLLM).toHaveBeenCalledTimes(2);
  });

  it('retry-success path for refine(): succeeds on second attempt when first response is invalid JSON', async () => {
    const validJson = JSON.stringify(BASE_RESPONSE);
    const mockCallLLM = vi
      .fn()
      .mockResolvedValueOnce({
        content: 'not valid json {{{',
        model: 'deepseek/deepseek-v4-flash',
        promptTokens: 10,
        completionTokens: 50,
        estimatedCostUsd: 0.0001,
        latencyMs: 50,
      })
      .mockResolvedValueOnce({
        content: validJson,
        model: 'deepseek/deepseek-v4-flash',
        promptTokens: 10,
        completionTokens: 50,
        estimatedCostUsd: 0.0001,
        latencyMs: 50,
      })
      .mockResolvedValue({
        content: validJson,
        model: 'deepseek/deepseek-v4-flash',
        promptTokens: 10,
        completionTokens: 50,
        estimatedCostUsd: 0.0001,
        latencyMs: 50,
      });

    const generator = new ArchetypeGenerator(mockCallLLM as typeof callLLM);
    const result = await generator.refine(
      { ...BASE_RESPONSE, estimated_manual_minutes: null },
      'Make it more concise',
    );

    expect(result.role_name).toBe('test-employee');
    expect(mockCallLLM).toHaveBeenCalledTimes(3);
  });

  it('retry-fail path for refine(): throws GENERATION_FAILED when both attempts return invalid JSON', async () => {
    const mockCallLLM = vi.fn().mockResolvedValue({
      content: 'not valid json {{{',
      model: 'deepseek/deepseek-v4-flash',
      promptTokens: 10,
      completionTokens: 50,
      estimatedCostUsd: 0.0001,
      latencyMs: 50,
    });

    const generator = new ArchetypeGenerator(mockCallLLM as typeof callLLM);

    await expect(
      generator.refine(
        { ...BASE_RESPONSE, estimated_manual_minutes: null },
        'Make it more concise',
      ),
    ).rejects.toThrow('GENERATION_FAILED');
    expect(mockCallLLM).toHaveBeenCalledTimes(2);
  });
});
