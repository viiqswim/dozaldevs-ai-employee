import { describe, it, expect } from 'vitest';
import { runInstallCommand } from '../../src/workers/lib/install-runner.js';

describe('install-runner', () => {
  it('runs echo ok command successfully and resolves without error', async () => {
    await expect(
      runInstallCommand({
        installCommand: 'echo ok',
        cwd: '/tmp',
      }),
    ).resolves.toBeUndefined();
  });

  it('runs a failing command (exit code 1) and rejects with error containing stdout/stderr', async () => {
    await expect(
      runInstallCommand({
        installCommand: 'sh -c "echo failed && exit 1"',
        cwd: '/tmp',
      }),
    ).rejects.toThrow();
  });

  it('passes the correct cwd to the child process', async () => {
    await expect(
      runInstallCommand({
        installCommand: 'pwd',
        cwd: '/tmp',
      }),
    ).resolves.toBeUndefined();
  });

  it('times out and rejects if command exceeds timeout', async () => {
    await expect(
      runInstallCommand({
        installCommand: 'sleep 10',
        cwd: '/tmp',
        timeoutMs: 100,
      }),
    ).rejects.toThrow();
  });

  it('handles install command with spaces and args correctly', async () => {
    await expect(
      runInstallCommand({
        installCommand: 'echo hello world test',
        cwd: '/tmp',
      }),
    ).resolves.toBeUndefined();
  });

  it('uses default timeout of 5 minutes when not specified', async () => {
    await expect(
      runInstallCommand({
        installCommand: 'echo test',
        cwd: '/tmp',
      }),
    ).resolves.toBeUndefined();
  });
});
