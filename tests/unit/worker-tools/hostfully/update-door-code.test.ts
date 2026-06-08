import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const TOOL_PATH = '../../../../src/worker-tools/hostfully/update-door-code.ts';

const PROPERTY_ID = 'prop-uid-test-1234';
const FIELD_UID = 'field-uid-abc-5678';
const CURRENT_CODE = '1234';
const NEW_CODE = '5678';

const MOCK_CUSTOM_DATA_ARRAY = [
  { customDataField: { uid: FIELD_UID, name: 'door_code' }, text: CURRENT_CODE },
  { customDataField: { uid: 'other-field-uid', name: 'wifi_password' }, text: 'secret' },
];

const MOCK_CUSTOM_DATA_WRAPPED = { customData: MOCK_CUSTOM_DATA_ARRAY };

const MOCK_CUSTOM_DATA_NO_DOOR_CODE = [
  { customDataField: { uid: 'other-field-uid', name: 'wifi_password' }, text: 'secret' },
];

function mockOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function mockErrorResponse(status: number, statusText = 'Error'): Response {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({ error: statusText }),
  } as unknown as Response;
}

describe('update-door-code tool', () => {
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

    // Harness artifact: the mocked process.exit throws ExitError, which surfaces
    // as an unhandled rejection when the first exit fires inside main().catch().
    // Real process.exit terminates the process, so this never happens in prod.
    swallowExitError = (reason: unknown) => {
      if (reason instanceof Error && reason.message.startsWith('ExitError:')) return;
      throw reason;
    };
    process.on('unhandledRejection', swallowExitError);

    // process.exit fires twice per error path: once from main() and once from the .catch() handler.
    // Second call must be a no-op to prevent re-throw into an unhandled promise rejection.
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

    process.env['HOSTFULLY_API_KEY'] = 'test-api-key-xyz';
    process.env['HOSTFULLY_API_URL'] = 'https://mock-hostfully.test';
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

  function stderr(): string {
    return stderrChunks.filter((c) => !c.startsWith('Fatal: Error: ExitError:')).join('');
  }

  function stdout(): string {
    return stdoutChunks.join('');
  }

  async function runTool(args: string[], envOverrides: Record<string, string | undefined> = {}) {
    process.argv = ['node', 'update-door-code.ts', ...args];

    for (const [key, value] of Object.entries(envOverrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    try {
      await import(TOOL_PATH);
    } catch (_) {
      // ExitError thrown by first-exit mock may escape dynamic import for
      // synchronous-before-first-await code paths. Caught here safely.
    }

    // Flush pending microtask chains (covers the two async fetch() awaits in main())
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  it('returns success JSON with correct fields on happy path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockOkResponse(MOCK_CUSTOM_DATA_ARRAY))
      .mockResolvedValueOnce(mockOkResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await runTool(['--property-id', PROPERTY_ID, '--code', NEW_CODE]);

    expect(capturedExitCode).toBeUndefined();
    const result = JSON.parse(stdout().trim()) as Record<string, unknown>;
    expect(result).toMatchObject({
      success: true,
      propertyId: PROPERTY_ID,
      previousCode: CURRENT_CODE,
      newCode: NEW_CODE,
    });
  });

  it('makes GET then POST with correct URL and body (two-step flow)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockOkResponse(MOCK_CUSTOM_DATA_ARRAY))
      .mockResolvedValueOnce(mockOkResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await runTool(['--property-id', PROPERTY_ID, '--code', NEW_CODE]);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [getUrl, getOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(getUrl).toContain('/api/v3.2/custom-data');
    expect(getUrl).toContain(PROPERTY_ID);
    const getHeaders = getOpts.headers as Record<string, string>;
    expect(getHeaders['X-HOSTFULLY-APIKEY']).toBe('test-api-key-xyz');

    const [postUrl, postOpts] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(postUrl).toContain('/api/v3.2/custom-data');
    expect(postOpts.method).toBe('POST');
    const body = JSON.parse(postOpts.body as string) as Record<string, unknown>;
    expect(body.propertyUid).toBe(PROPERTY_ID);
    expect(body.customDataFieldUid).toBe(FIELD_UID);
    expect(body.text).toBe(NEW_CODE);
  });

  it('handles wrapped response envelope {customData: [...]} correctly', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockOkResponse(MOCK_CUSTOM_DATA_WRAPPED))
      .mockResolvedValueOnce(mockOkResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await runTool(['--property-id', PROPERTY_ID, '--code', NEW_CODE]);

    expect(capturedExitCode).toBeUndefined();
    const result = JSON.parse(stdout().trim()) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.previousCode).toBe(CURRENT_CODE);
    expect(result.newCode).toBe(NEW_CODE);
  });

  it('exits 2 when door_code field is absent from custom data', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockOkResponse(MOCK_CUSTOM_DATA_NO_DOOR_CODE));
    vi.stubGlobal('fetch', fetchMock);

    await runTool(['--property-id', PROPERTY_ID, '--code', NEW_CODE]);

    expect(capturedExitCode).toBe(2);
    expect(stderr()).toContain('door_code');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('exits 2 when custom data is an empty array', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockOkResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await runTool(['--property-id', PROPERTY_ID, '--code', NEW_CODE]);

    expect(capturedExitCode).toBe(2);
  });

  it('exits 1 and prints status code when GET returns 401 Unauthorized', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockErrorResponse(401, 'Unauthorized'));
    vi.stubGlobal('fetch', fetchMock);

    await runTool(['--property-id', PROPERTY_ID, '--code', NEW_CODE]);

    expect(capturedExitCode).toBe(1);
    expect(stderr()).toContain('401');
  });

  it('exits 1 and prints status code when POST returns 500', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockOkResponse(MOCK_CUSTOM_DATA_ARRAY))
      .mockResolvedValueOnce(mockErrorResponse(500, 'Internal Server Error'));
    vi.stubGlobal('fetch', fetchMock);

    await runTool(['--property-id', PROPERTY_ID, '--code', NEW_CODE]);

    expect(capturedExitCode).toBe(1);
    expect(stderr()).toContain('500');
  });

  it('exits 1 with connection error message when GET fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed: ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    await runTool(['--property-id', PROPERTY_ID, '--code', NEW_CODE]);

    expect(capturedExitCode).toBe(1);
    expect(stderr()).toContain('Failed to connect');
  });

  it('exits 1 with connection error message when POST fetch throws', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockOkResponse(MOCK_CUSTOM_DATA_ARRAY))
      .mockRejectedValueOnce(new TypeError('fetch failed: network timeout'));
    vi.stubGlobal('fetch', fetchMock);

    await runTool(['--property-id', PROPERTY_ID, '--code', NEW_CODE]);

    expect(capturedExitCode).toBe(1);
    expect(stderr()).toContain('Failed to connect');
  });

  it('exits 1 with --property-id mentioned when flag is missing', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await runTool(['--code', NEW_CODE]);

    expect(capturedExitCode).toBe(1);
    expect(stderr()).toContain('--property-id');
    expect(vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('exits 1 with --code mentioned when code flag is missing', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await runTool(['--property-id', PROPERTY_ID]);

    expect(capturedExitCode).toBe(1);
    expect(stderr()).toContain('--code');
  });

  it('exits 1 mentioning HOSTFULLY_API_KEY when env var is not set', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await runTool(['--property-id', PROPERTY_ID, '--code', NEW_CODE], {
      HOSTFULLY_API_KEY: undefined,
    });

    expect(capturedExitCode).toBe(1);
    expect(stderr()).toContain('HOSTFULLY_API_KEY');
  });
});
