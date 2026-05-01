/**
 * Sifely TTLock API shell tool — lists passcodes and access records.
 *
 * Usage:
 *   tsx sifely-client.ts --action list-passcodes --lock-id <id>
 *   tsx sifely-client.ts --action list-access-records --lock-id <id> --start-date <ms> --end-date <ms>
 *
 * API quirks:
 *   - HTTP 200 on auth failure — MUST check body.code, NOT HTTP status
 *   - List success omits `code` field entirely — presence of `code` = error
 *   - Auth header: "Authorization: Bearer {token}"
 */

interface LockPasscode {
  keyboardPwdId: number;
  lockId: string;
  keyboardPwd: string;
  keyboardPwdName: string;
  keyboardPwdType: number; // 1=ONE_TIME, 2=PERMANENT, 3=TIMED
  startDate: number;
  endDate: number;
  status: number;
}

interface AccessRecord {
  recordId: number;
  lockId: number;
  recordType: number; // 4=passcode
  success: number; // 1=success, 0=failed
  keyboardPwd: string;
  lockDate: number; // ms since epoch
  serverDate: number;
}

interface SifelyLoginResponse {
  code: number;
  msg?: string;
  data?: {
    token: string;
  };
}

interface SifelyListResponse<T> {
  list?: T[];
  pageNo?: number;
  pageSize?: number;
  code?: number;
  msg?: string;
}

interface SifelyPasscodeRaw {
  keyboardPwdId: number;
  keyboardPwd: string;
  keyboardPwdName: string;
  keyboardPwdType: number;
  startDate: number;
  endDate: number;
  status: number;
}

interface SifelyAccessRecordRaw {
  recordId: number;
  lockId: number;
  recordType: number;
  success: number;
  keyboardPwd: string;
  lockDate: number;
  serverDate: number;
}

function parseArgs(argv: string[]): {
  action: string;
  lockId: string;
  startDate: string;
  endDate: string;
  help: boolean;
} {
  const args = argv.slice(2);
  let action = '';
  let lockId = '';
  let startDate = '';
  let endDate = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--action' && args[i + 1]) {
      action = args[++i];
    } else if (args[i] === '--lock-id' && args[i + 1]) {
      lockId = args[++i];
    } else if (args[i] === '--start-date' && args[i + 1]) {
      startDate = args[++i];
    } else if (args[i] === '--end-date' && args[i + 1]) {
      endDate = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      help = true;
    }
  }

  return { action, lockId, startDate, endDate, help };
}

async function login(
  baseUrl: string,
  clientId: string,
  username: string,
  password: string,
): Promise<string> {
  const params = new URLSearchParams({
    client_id: clientId,
    username,
    password,
    date: String(Date.now()),
  });

  const response = await fetch(`${baseUrl}/system/smart/login?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      Origin: 'https://manager.sifely.com',
      Referer: 'https://manager.sifely.com/',
      isToken: 'false',
    },
  });

  if (!response.ok) {
    throw new Error(`Sifely login HTTP error: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as SifelyLoginResponse;

  // CRITICAL: Sifely returns HTTP 200 even on auth failure — must check body.code
  if (body.code !== 200 || !body.data?.token) {
    throw new Error(`Sifely authentication failed: ${body.msg ?? `code ${body.code}`}`);
  }

  return body.data.token;
}

async function listPasscodes(
  baseUrl: string,
  token: string,
  lockId: string,
): Promise<LockPasscode[]> {
  const params = new URLSearchParams({
    lockId,
    pageNo: '1',
    pageSize: '100',
    date: String(Date.now()),
  });

  const response = await fetch(`${baseUrl}/v3/lock/listKeyboardPwd?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Sifely listPasscodes HTTP error: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as SifelyListResponse<SifelyPasscodeRaw>;

  // CRITICAL: list success omits `code` entirely — presence of `code` means error
  if (body.code !== undefined) {
    throw new Error(`Sifely listPasscodes error: ${body.msg ?? `code ${body.code}`}`);
  }

  return (body.list ?? []).map(
    (item): LockPasscode => ({
      keyboardPwdId: item.keyboardPwdId,
      lockId,
      keyboardPwd: item.keyboardPwd,
      keyboardPwdName: item.keyboardPwdName,
      keyboardPwdType: item.keyboardPwdType,
      startDate: item.startDate,
      endDate: item.endDate,
      status: item.status,
    }),
  );
}

async function listAccessRecords(
  baseUrl: string,
  token: string,
  lockId: string,
  startDate: number,
  endDate: number,
): Promise<AccessRecord[]> {
  const params = new URLSearchParams({
    lockId,
    startDate: String(startDate),
    endDate: String(endDate),
    pageNo: '1',
    pageSize: '20',
    date: String(Date.now()),
  });

  const response = await fetch(`${baseUrl}/v3/lockRecord/list?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(
      `Sifely listAccessRecords HTTP error: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as SifelyListResponse<SifelyAccessRecordRaw>;

  // CRITICAL: list success omits `code` entirely — presence of `code` means error
  if (body.code !== undefined) {
    throw new Error(`Sifely listAccessRecords error: ${body.msg ?? `code ${body.code}`}`);
  }

  return (body.list ?? []).map(
    (item): AccessRecord => ({
      recordId: item.recordId,
      lockId: item.lockId,
      recordType: item.recordType,
      success: item.success,
      keyboardPwd: item.keyboardPwd,
      lockDate: item.lockDate,
      serverDate: item.serverDate,
    }),
  );
}

async function main(): Promise<void> {
  const { action, lockId, startDate, endDate, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx sifely-client.ts --action <action> --lock-id <id> [options]\n\n' +
        'Wraps the Sifely TTLock API for listing passcodes and access records.\n\n' +
        'Options:\n' +
        '  --action <action>      (required) Action to perform:\n' +
        '                           list-passcodes       — list all keyboard passcodes for a lock\n' +
        '                           list-access-records  — list access records for a date range\n' +
        '  --lock-id <id>         (required) Sifely lock ID\n' +
        '  --start-date <ms>      (required for list-access-records) Start date as epoch ms\n' +
        '  --end-date <ms>        (required for list-access-records) End date as epoch ms\n' +
        '  --help                 Show this help message\n\n' +
        'Environment variables:\n' +
        '  SIFELY_USERNAME        (required) Sifely account username\n' +
        '  SIFELY_PASSWORD        (required) Sifely account password\n' +
        '  SIFELY_CLIENT_ID       (optional) API client ID (default: VLRE)\n' +
        '  SIFELY_BASE_URL        (optional) API base URL (default: https://app-smart-server.sifely.com)\n\n' +
        'Output:\n' +
        '  JSON array written to stdout — LockPasscode[] or AccessRecord[]\n\n' +
        'Examples:\n' +
        '  tsx sifely-client.ts --action list-passcodes --lock-id 12345\n' +
        '  tsx sifely-client.ts --action list-access-records --lock-id 12345 --start-date 1700000000000 --end-date 1700086400000\n',
    );
    process.exit(0);
  }

  if (!action) {
    process.stderr.write('Error: --action flag is required\n');
    process.exit(1);
  }

  if (!lockId) {
    process.stderr.write('Error: --lock-id argument is required\n');
    process.exit(1);
  }

  const username = process.env['SIFELY_USERNAME'];
  if (!username) {
    process.stderr.write('Error: SIFELY_USERNAME environment variable is required\n');
    process.exit(1);
  }

  const password = process.env['SIFELY_PASSWORD'];
  if (!password) {
    process.stderr.write('Error: SIFELY_PASSWORD environment variable is required\n');
    process.exit(1);
  }

  const clientId = process.env['SIFELY_CLIENT_ID'] ?? 'VLRE';
  const baseUrl = (process.env['SIFELY_BASE_URL'] ?? 'https://app-smart-server.sifely.com').replace(
    /\/$/,
    '',
  );

  const token = await login(baseUrl, clientId, username, password);

  if (action === 'list-passcodes') {
    const passcodes = await listPasscodes(baseUrl, token, lockId);
    process.stdout.write(JSON.stringify(passcodes) + '\n');
  } else if (action === 'list-access-records') {
    if (!startDate || !endDate) {
      process.stderr.write(
        'Error: --start-date and --end-date are required for list-access-records\n',
      );
      process.exit(1);
    }

    const startMs = Number(startDate);
    const endMs = Number(endDate);

    if (isNaN(startMs) || isNaN(endMs)) {
      process.stderr.write(
        'Error: --start-date and --end-date must be numeric epoch milliseconds\n',
      );
      process.exit(1);
    }

    const records = await listAccessRecords(baseUrl, token, lockId, startMs, endMs);
    process.stdout.write(JSON.stringify(records) + '\n');
  } else {
    process.stderr.write(
      `Error: Unknown action "${action}". Valid actions: list-passcodes, list-access-records\n`,
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
