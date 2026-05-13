/**
 * Sifely TTLock API shell tool — lists passcodes, access records, locks, and manages passcodes.
 *
 * Usage:
 *   tsx sifely-client.ts --action list-passcodes --lock-id <id>
 *   tsx sifely-client.ts --action list-access-records --lock-id <id> --start-date <ms> --end-date <ms>
 *   tsx sifely-client.ts --action list-locks
 *   tsx sifely-client.ts --action create-passcode --lock-id <id> --name <name> --code <digits>
 *   tsx sifely-client.ts --action update-passcode --lock-id <id> --passcode-id <id> [--name <name>] [--code <digits>]
 *   tsx sifely-client.ts --action delete-passcode --lock-id <id> --passcode-id <id>
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

interface SifelyLock {
  lockId: number;
  lockName: string;
  lockAlias: string;
  lockMac: string;
  electricQuantity: number;
  hasGateway: number;
}

interface SifelyLockListResponse {
  list?: SifelyLock[];
  code?: number;
  msg?: string;
  errcode?: number;
  errmsg?: string;
}

interface SifelyCreatePasscodeResponse {
  keyboardPwdId?: number;
  code?: number;
  msg?: string;
  errcode?: number;
  errmsg?: string;
}

interface SifelyMutationResponse {
  errcode?: number;
  errmsg?: string;
  code?: number;
  msg?: string;
}

function parseArgs(argv: string[]): {
  action: string;
  lockId: string;
  startDate: string;
  endDate: string;
  help: boolean;
  name: string;
  code: string;
  passcodeId: string;
  type: string;
} {
  const args = argv.slice(2);
  let action = '';
  let lockId = '';
  let startDate = '';
  let endDate = '';
  let help = false;
  let name = '';
  let code = '';
  let passcodeId = '';
  let type = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--action' && args[i + 1]) {
      action = args[++i];
    } else if (args[i] === '--lock-id' && args[i + 1]) {
      lockId = args[++i];
    } else if (args[i] === '--start-date' && args[i + 1]) {
      startDate = args[++i];
    } else if (args[i] === '--end-date' && args[i + 1]) {
      endDate = args[++i];
    } else if (args[i] === '--name' && args[i + 1]) {
      name = args[++i];
    } else if (args[i] === '--code' && args[i + 1]) {
      code = args[++i];
    } else if (args[i] === '--passcode-id' && args[i + 1]) {
      passcodeId = args[++i];
    } else if (args[i] === '--type' && args[i + 1]) {
      type = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      help = true;
    }
  }

  return { action, lockId, startDate, endDate, help, name, code, passcodeId, type };
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

async function listLocks(baseUrl: string, token: string, clientId: string): Promise<SifelyLock[]> {
  const params = new URLSearchParams({
    clientId,
    accessToken: token,
    pageNo: '1',
    pageSize: '1000',
    date: String(Date.now()),
  });

  const response = await fetch(`${baseUrl}/v3/lock/list`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Sifely listLocks HTTP error: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as SifelyLockListResponse;

  if (
    (body.code !== undefined && body.code !== 200) ||
    (body.errcode !== undefined && body.errcode !== 0)
  ) {
    throw new Error(
      `Sifely listLocks error: ${body.msg ?? body.errmsg ?? `code ${body.code ?? body.errcode}`}`,
    );
  }

  return body.list ?? [];
}

async function createPasscode(
  baseUrl: string,
  token: string,
  clientId: string,
  lockId: string,
  code: string,
  name: string,
  startDate: number,
  endDate: number,
): Promise<{ keyboardPwdId: number }> {
  const params = new URLSearchParams({
    clientId,
    accessToken: token,
    lockId,
    keyboardPwd: code,
    keyboardPwdName: name,
    startDate: String(startDate),
    endDate: String(endDate),
    addType: '2',
    keyboardPwdType: '2',
    date: String(Date.now()),
  });

  const response = await fetch(`${baseUrl}/v3/keyboardPwd/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${token}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Sifely createPasscode HTTP error: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as SifelyCreatePasscodeResponse;

  if (
    (body.code !== undefined && body.code !== 200) ||
    (body.errcode !== undefined && body.errcode !== 0)
  ) {
    throw new Error(
      `Sifely createPasscode error: ${body.msg ?? body.errmsg ?? `code ${body.code ?? body.errcode}`}`,
    );
  }

  return { keyboardPwdId: body.keyboardPwdId ?? 0 };
}

async function updatePasscode(
  baseUrl: string,
  token: string,
  clientId: string,
  lockId: string,
  passcodeId: string,
  name?: string,
  startDate?: number,
  endDate?: number,
  newCode?: string,
): Promise<{ ok: true }> {
  const params = new URLSearchParams({
    clientId,
    accessToken: token,
    lockId,
    keyboardPwdId: passcodeId,
    changeType: '2',
    date: String(Date.now()),
  });

  if (name) {
    params.set('keyboardPwdName', name);
  }
  if (startDate !== undefined) {
    params.set('startDate', String(startDate));
  }
  if (endDate !== undefined) {
    params.set('endDate', String(endDate));
  }
  if (newCode !== undefined) {
    params.set('newKeyboardPwd', newCode);
  }

  const response = await fetch(`${baseUrl}/v3/keyboardPwd/change`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${token}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Sifely updatePasscode HTTP error: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as SifelyMutationResponse;

  if (
    (body.code !== undefined && body.code !== 200) ||
    (body.errcode !== undefined && body.errcode !== 0)
  ) {
    throw new Error(
      `Sifely updatePasscode error: ${body.msg ?? body.errmsg ?? `code ${body.code ?? body.errcode}`}`,
    );
  }

  return { ok: true };
}

async function deletePasscode(
  baseUrl: string,
  token: string,
  clientId: string,
  lockId: string,
  passcodeId: string,
): Promise<{ ok: true }> {
  const params = new URLSearchParams({
    clientId,
    accessToken: token,
    lockId,
    keyboardPwdId: passcodeId,
    deleteType: '2',
    date: String(Date.now()),
  });

  const response = await fetch(`${baseUrl}/v3/keyboardPwd/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${token}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Sifely deletePasscode HTTP error: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as SifelyMutationResponse;

  if (
    (body.code !== undefined && body.code !== 200) ||
    (body.errcode !== undefined && body.errcode !== 0)
  ) {
    throw new Error(
      `Sifely deletePasscode error: ${body.msg ?? body.errmsg ?? `code ${body.code ?? body.errcode}`}`,
    );
  }

  return { ok: true };
}

async function main(): Promise<void> {
  const { action, lockId, startDate, endDate, help, name, code, passcodeId, type } = parseArgs(
    process.argv,
  );

  if (help) {
    process.stdout.write(
      'Usage: tsx sifely-client.ts --action <action> [--lock-id <id>] [options]\n\n' +
        'Wraps the Sifely TTLock API for managing locks and passcodes.\n\n' +
        'Options:\n' +
        '  --action <action>      (required) Action to perform:\n' +
        '                           list-locks           — list all locks for the account\n' +
        '                           list-passcodes       — list all keyboard passcodes for a lock\n' +
        '                           list-access-records  — list access records for a date range\n' +
        '                           create-passcode      — create a new keyboard passcode\n' +
        '                           update-passcode      — update an existing passcode\n' +
        '                           delete-passcode      — delete a passcode\n' +
        '  --lock-id <id>         (required for most actions) Sifely lock ID\n' +
        '  --start-date <ms>      (required for list-access-records / timed create) Start date as epoch ms\n' +
        '  --end-date <ms>        (required for list-access-records / timed create) End date as epoch ms\n' +
        '  --name <name>          Passcode name (required for create-passcode, optional for update-passcode)\n' +
        '  --code <digits>        4-9 numeric digits (required for create-passcode, optional for update-passcode to change the code)\n' +
        '  --passcode-id <id>     Passcode ID (required for update-passcode and delete-passcode)\n' +
        '  --type <type>          Passcode type: permanent (default) or timed (requires --start-date/--end-date)\n' +
        '  --help                 Show this help message\n\n' +
        'Environment variables:\n' +
        '  SIFELY_USERNAME        (required) Sifely account username\n' +
        '  SIFELY_PASSWORD        (required) Sifely account password\n' +
        '  SIFELY_CLIENT_ID       (optional) API client ID (default: VLRE)\n' +
        '  SIFELY_BASE_URL        (optional) API base URL (default: https://app-smart-server.sifely.com)\n\n' +
        'Output:\n' +
        '  JSON written to stdout — array for list actions, object for mutations\n\n' +
        'Examples:\n' +
        '  tsx sifely-client.ts --action list-locks\n' +
        '  tsx sifely-client.ts --action list-passcodes --lock-id 12345\n' +
        '  tsx sifely-client.ts --action list-access-records --lock-id 12345 --start-date 1700000000000 --end-date 1700086400000\n' +
        '  tsx sifely-client.ts --action create-passcode --lock-id 12345 --name "Front Door" --code 123456\n' +
        '  tsx sifely-client.ts --action create-passcode --lock-id 12345 --name "Guest" --code 987654 --type timed --start-date 1700000000000 --end-date 1700086400000\n' +
        '  tsx sifely-client.ts --action update-passcode --lock-id 12345 --passcode-id 99 --name "New Name"\n' +
        '  tsx sifely-client.ts --action update-passcode --lock-id 12345 --passcode-id 99 --code 654321\n' +
        '  tsx sifely-client.ts --action delete-passcode --lock-id 12345 --passcode-id 99\n',
    );
    process.exit(0);
  }

  if (!action) {
    process.stderr.write('Error: --action flag is required\n');
    process.exit(1);
  }

  // list-locks does not require --lock-id
  if (!lockId && action !== 'list-locks') {
    process.stderr.write('Error: --lock-id argument is required\n');
    process.exit(1);
  }

  if (action === 'create-passcode') {
    if (!/^\d{4,9}$/.test(code)) {
      process.stderr.write('Error: --code must be 4-9 numeric digits\n');
      process.exit(1);
    }
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
  } else if (action === 'list-locks') {
    const locks = await listLocks(baseUrl, token, clientId);
    process.stdout.write(JSON.stringify(locks) + '\n');
  } else if (action === 'create-passcode') {
    let createStartDate: number;
    let createEndDate: number;

    const passcodeType = type || 'permanent';
    if (passcodeType === 'timed') {
      if (!startDate || !endDate) {
        process.stderr.write(
          'Error: --start-date and --end-date are required for timed passcode type\n',
        );
        process.exit(1);
      }
      createStartDate = Number(startDate);
      createEndDate = Number(endDate);
      if (isNaN(createStartDate) || isNaN(createEndDate)) {
        process.stderr.write(
          'Error: --start-date and --end-date must be numeric epoch milliseconds\n',
        );
        process.exit(1);
      }
    } else {
      createStartDate = Date.now();
      createEndDate = 0;
    }

    const existingPasscodes = await listPasscodes(baseUrl, token, lockId);
    const existing = existingPasscodes.find((p) => p.keyboardPwdName === name);
    if (existing) {
      process.stdout.write(
        JSON.stringify({ keyboardPwdId: existing.keyboardPwdId, existed: true }) + '\n',
      );
      process.exit(0);
    }

    const result = await createPasscode(
      baseUrl,
      token,
      clientId,
      lockId,
      code,
      name,
      createStartDate,
      createEndDate,
    );
    process.stdout.write(JSON.stringify({ keyboardPwdId: result.keyboardPwdId }) + '\n');
  } else if (action === 'update-passcode') {
    if (!passcodeId) {
      process.stderr.write('Error: --passcode-id is required for update-passcode\n');
      process.exit(1);
    }

    const updateStartDate = startDate ? Number(startDate) : undefined;
    const updateEndDate = endDate ? Number(endDate) : undefined;

    await updatePasscode(
      baseUrl,
      token,
      clientId,
      lockId,
      passcodeId,
      name || undefined,
      updateStartDate,
      updateEndDate,
      code || undefined,
    );
    process.stdout.write(JSON.stringify({ ok: true }) + '\n');
  } else if (action === 'delete-passcode') {
    if (!passcodeId) {
      process.stderr.write('Error: --passcode-id is required for delete-passcode\n');
      process.exit(1);
    }

    await deletePasscode(baseUrl, token, clientId, lockId, passcodeId);
    process.stdout.write(JSON.stringify({ ok: true }) + '\n');
  } else {
    process.stderr.write(
      `Error: Unknown action "${action}". Valid actions: list-locks, list-passcodes, list-access-records, create-passcode, update-passcode, delete-passcode\n`,
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
