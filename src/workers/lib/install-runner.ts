import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface RunInstallOptions {
  installCommand: string;
  cwd: string;
  timeoutMs?: number;
}

export async function runInstallCommand(opts: RunInstallOptions): Promise<void> {
  const { installCommand, cwd, timeoutMs = 5 * 60 * 1000 } = opts;

  const [cmd, ...args] = installCommand.split(' ');

  await execFileAsync(cmd, args, {
    cwd,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
}
