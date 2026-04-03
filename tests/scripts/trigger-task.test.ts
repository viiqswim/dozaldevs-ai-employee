import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('zx', () => ({
  $: vi.fn(),
}));

import { $ } from 'zx';
import { getExecutionProgress, getValidationRuns } from '../../scripts/trigger-task.js';

const mockZx = vi.mocked($);

describe('getExecutionProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns currentStage and fixIterations on valid row', async () => {
    (mockZx as any).mockResolvedValue({ stdout: 'executing|2' });
    const result = await getExecutionProgress('task-1');
    expect(result).toEqual({ currentStage: 'executing', fixIterations: 2 });
  });

  it('returns null when psql returns empty string', async () => {
    (mockZx as any).mockResolvedValue({ stdout: '' });
    const result = await getExecutionProgress('task-1');
    expect(result).toBeNull();
  });

  it('returns null when current_stage is empty', async () => {
    (mockZx as any).mockResolvedValue({ stdout: '|0' });
    const result = await getExecutionProgress('task-1');
    expect(result).toBeNull();
  });

  it('returns null when query throws', async () => {
    (mockZx as any).mockRejectedValue(new Error('DB error'));
    const result = await getExecutionProgress('task-1');
    expect(result).toBeNull();
  });

  it('returns fixIterations: 0 when field is 0', async () => {
    (mockZx as any).mockResolvedValue({ stdout: 'starting|0' });
    const result = await getExecutionProgress('task-1');
    expect(result).toEqual({ currentStage: 'starting', fixIterations: 0 });
  });

  it('parses stage with whitespace correctly', async () => {
    (mockZx as any).mockResolvedValue({ stdout: '  validating  |5' });
    const result = await getExecutionProgress('task-1');
    expect(result).toEqual({ currentStage: 'validating', fixIterations: 5 });
  });

  it('handles large fixIterations count', async () => {
    (mockZx as any).mockResolvedValue({ stdout: 'executing|999' });
    const result = await getExecutionProgress('task-1');
    expect(result).toEqual({ currentStage: 'executing', fixIterations: 999 });
  });
});

describe('getValidationRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when psql returns empty string', async () => {
    (mockZx as any).mockResolvedValue({ stdout: '' });
    const result = await getValidationRuns('task-1');
    expect(result).toEqual([]);
  });

  it('parses single passed validation row', async () => {
    (mockZx as any).mockResolvedValue({ stdout: 'typescript|passed|0|' });
    const result = await getValidationRuns('task-1');
    expect(result).toEqual([
      { stage: 'typescript', status: 'passed', iteration: 0, errorOutput: '' },
    ]);
  });

  it('parses failed validation row with error output', async () => {
    (mockZx as any).mockResolvedValue({ stdout: 'unit|failed|1|Expected 2 but got 3' });
    const result = await getValidationRuns('task-1');
    expect(result).toEqual([
      { stage: 'unit', status: 'failed', iteration: 1, errorOutput: 'Expected 2 but got 3' },
    ]);
  });

  it('parses multiple validation rows in order', async () => {
    (mockZx as any).mockResolvedValue({
      stdout: 'typescript|passed|0|\nlint|passed|0|\nunit|passed|0|',
    });
    const result = await getValidationRuns('task-1');
    expect(result).toHaveLength(3);
    expect(result[0].stage).toBe('typescript');
    expect(result[1].stage).toBe('lint');
    expect(result[2].stage).toBe('unit');
  });

  it('returns empty array when query throws', async () => {
    (mockZx as any).mockRejectedValue(new Error('DB error'));
    const result = await getValidationRuns('task-1');
    expect(result).toEqual([]);
  });

  it('handles validation with whitespace in fields', async () => {
    (mockZx as any).mockResolvedValue({ stdout: '  typescript  |  passed  |0|  ' });
    const result = await getValidationRuns('task-1');
    expect(result).toEqual([
      { stage: 'typescript', status: 'passed', iteration: 0, errorOutput: '' },
    ]);
  });

  it('parses validation with high iteration count', async () => {
    (mockZx as any).mockResolvedValue({ stdout: 'unit|failed|42|Error message' });
    const result = await getValidationRuns('task-1');
    expect(result[0].iteration).toBe(42);
  });

  it('filters out blank lines in multi-row output', async () => {
    (mockZx as any).mockResolvedValue({ stdout: 'typescript|passed|0|\n\nlint|passed|0|' });
    const result = await getValidationRuns('task-1');
    expect(result).toHaveLength(2);
  });

  it('preserves error output with special characters', async () => {
    (mockZx as any).mockResolvedValue({
      stdout: 'unit|failed|1|Error: Expected "foo" but got "bar"',
    });
    const result = await getValidationRuns('task-1');
    expect(result[0].errorOutput).toBe('Error: Expected "foo" but got "bar"');
  });

  it('handles empty error output field', async () => {
    (mockZx as any).mockResolvedValue({ stdout: 'build|passed|0|' });
    const result = await getValidationRuns('task-1');
    expect(result[0].errorOutput).toBe('');
  });
});
