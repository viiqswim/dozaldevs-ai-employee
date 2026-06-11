import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const TOOL_PATH = '../../../src/worker-tools/composio/execute.ts';

describe('composio/execute tool', () => {
  let capturedExitCode: number | undefined;
  let stdoutChunks: string[];
  let stderrChunks: string[];
  let savedArgv: string[];
  let savedEnv: NodeJS.ProcessEnv;
  let swallowExitError: (reason: unknown) => void;

  beforeEach(() => {
    vi.resetModules();
    capturedExitCode = undefined;
    stdoutChunks = [];
    stderrChunks = [];
    savedArgv = process.argv;
    savedEnv = { ...process.env };

    swallowExitError = (reason: unknown) => {
      if (reason instanceof Error && reason.message.startsWith('ExitError:')) return;
      throw reason;
    };
    process.on('unhandledRejection', swallowExitError);

    let firstExitDone = false;
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
      if (!firstExitDone) {
        firstExitDone = true;
        capturedExitCode = typeof code === 'number' ? code : 0;
        throw new Error(`ExitError:${capturedExitCode}`);
      }
      return undefined as never;
    });

    vi.spyOn(process.stdout, 'write').mockImplementation(
      (chunk: Parameters<typeof process.stdout.write>[0]) => {
        stdoutChunks.push(String(chunk));
        return true;
      },
    );
    vi.spyOn(process.stderr, 'write').mockImplementation(
      (chunk: Parameters<typeof process.stderr.write>[0]) => {
        stderrChunks.push(String(chunk));
        return true;
      },
    );
    vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
      stdoutChunks.push(parts.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
      stderrChunks.push(parts.map(String).join(' '));
    });

    process.env['COMPOSIO_API_KEY'] = 'test-composio-key';
    process.env['TASK_TENANT_ID'] = 'tenant-uuid-1234';
  });

  afterEach(() => {
    process.off('unhandledRejection', swallowExitError);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.argv = savedArgv;
    for (const key of Object.keys(process.env)) {
      if (key in savedEnv) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  function stdout(): string {
    return stdoutChunks.join('');
  }

  async function runTool(args: string[]) {
    process.argv = ['node', 'execute.ts', ...args];
    try {
      await import(TOOL_PATH);
    } catch (_) {
      // ExitError from the first-exit mock may escape the dynamic import for
      // synchronous code paths that exit before the first await. Caught safely.
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  it('returns fixture JSON in --mock mode without making an HTTP call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await runTool([
      '--mock',
      '--toolkit',
      'notion',
      '--action',
      'NOTION_GET_PAGE_MARKDOWN',
      '--params',
      '{"page_id":"test"}',
    ]);

    expect(capturedExitCode).toBe(0);
    const result = JSON.parse(stdout().trim()) as { data?: { successful?: boolean } };
    expect(result.data?.successful).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
