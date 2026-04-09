import { describe, it, expect } from 'vitest';
import { classifyCiFailure, summarizeCheckRuns } from '../../../src/workers/lib/ci-classifier.js';
import type { CheckRun } from '../../../src/workers/lib/ci-classifier.js';

describe('classifyCiFailure', () => {
  it('classifies lint check as substantive', () => {
    const check: CheckRun = { name: 'lint', conclusion: 'failure' };
    expect(classifyCiFailure(check)).toBe('substantive');
  });

  it('classifies test check as substantive', () => {
    const check: CheckRun = { name: 'Run tests', conclusion: 'failure' };
    expect(classifyCiFailure(check)).toBe('substantive');
  });

  it('classifies build check as substantive', () => {
    const check: CheckRun = { name: 'Build project', conclusion: 'failure' };
    expect(classifyCiFailure(check)).toBe('substantive');
  });

  it('classifies typecheck check as substantive', () => {
    const check: CheckRun = { name: 'typecheck', conclusion: 'failure' };
    expect(classifyCiFailure(check)).toBe('substantive');
  });

  it('classifies type-check check as substantive', () => {
    const check: CheckRun = { name: 'type-check', conclusion: 'failure' };
    expect(classifyCiFailure(check)).toBe('substantive');
  });

  it('classifies e2e check as substantive', () => {
    const check: CheckRun = { name: 'e2e tests', conclusion: 'failure' };
    expect(classifyCiFailure(check)).toBe('substantive');
  });

  it('classifies setup check as infra', () => {
    const check: CheckRun = { name: 'setup environment', conclusion: 'failure' };
    expect(classifyCiFailure(check)).toBe('infra');
  });

  it('classifies docker check as infra', () => {
    const check: CheckRun = { name: 'docker build', conclusion: 'failure' };
    expect(classifyCiFailure(check)).toBe('infra');
  });

  it('classifies install check as infra by title when name is generic', () => {
    const check: CheckRun = {
      name: 'CI',
      conclusion: 'failure',
      output: { title: 'install failed', summary: 'npm install error' },
    };
    expect(classifyCiFailure(check)).toBe('infra');
  });

  it('classifies unknown check as unknown', () => {
    const check: CheckRun = { name: 'some-other-check', conclusion: 'failure' };
    expect(classifyCiFailure(check)).toBe('unknown');
  });
});

describe('summarizeCheckRuns', () => {
  it('counts substantive and infra failures separately', () => {
    const checks: CheckRun[] = [
      { name: 'lint', conclusion: 'failure' },
      { name: 'docker', conclusion: 'failure' },
      { name: 'some-check', conclusion: 'failure' },
      { name: 'build', conclusion: 'success' },
    ];
    const result = summarizeCheckRuns(checks);
    expect(result.substantive).toBe(1);
    expect(result.infra).toBe(1);
    expect(result.unknown).toBe(1);
  });

  it('sets failed=true when there are substantive failures', () => {
    const checks: CheckRun[] = [{ name: 'tests', conclusion: 'failure' }];
    expect(summarizeCheckRuns(checks).failed).toBe(true);
  });

  it('sets failed=false when only infra failures', () => {
    const checks: CheckRun[] = [{ name: 'docker', conclusion: 'failure' }];
    expect(summarizeCheckRuns(checks).failed).toBe(false);
  });

  it('ignores non-failure conclusions', () => {
    const checks: CheckRun[] = [
      { name: 'lint', conclusion: 'success' },
      { name: 'tests', conclusion: 'skipped' },
    ];
    const result = summarizeCheckRuns(checks);
    expect(result.substantive).toBe(0);
    expect(result.failed).toBe(false);
  });

  it('returns all zeros for empty array', () => {
    const result = summarizeCheckRuns([]);
    expect(result).toEqual({ substantive: 0, infra: 0, unknown: 0, failed: false });
  });
});
