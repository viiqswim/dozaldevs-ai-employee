/**
 * diagnose-access.ts
 *
 * Diagnosis orchestrator — cross-references Hostfully door codes against
 * Sifely smart lock passcodes and recent access records.
 *
 * Usage:
 *   tsx diagnose-access.ts --property-id <hostfully-property-uid>
 *
 * Output:
 *   JSON diagnosis object written to stdout
 *
 * Sifely API quirks:
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
  lockDate: number;
  serverDate: number;
}

interface PropertyLock {
  id: string;
  tenant_id: string;
  property_external_id: string;
  lock_external_id: string;
  lock_name: string;
  lock_provider: string;
  lock_role: string | null;
  property_type: string;
  property_name: string;
  passcode_name: string | null;
  lock_metadata: unknown;
}

interface LockDiagnosisResult {
  lockId: string;
  lockName: string;
  lockRole: string | null;
  expectedPasscodeName: string;
  matchedPasscode: LockPasscode | null;
  allPermanentPasscodes: LockPasscode[];
  matchesHostfully: boolean;
  passcodeFound: boolean;
  accessRecords: AccessRecord[];
  error?: string;
}

interface DiagnosisOutput {
  propertyId: string;
  hostfullyDoorCode: string | null;
  expectedPasscodeName?: string;
  locks: LockDiagnosisResult[];
  hasMismatch: boolean;
  diagnosisSummary: string;
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

interface CustomDataField {
  uid: string;
  name: string;
}

interface CustomDataEntry {
  customDataField: CustomDataField;
  text: string;
}

function parseArgs(argv: string[]): { propertyId: string; help: boolean } {
  const args = argv.slice(2);
  let propertyId = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--property-id' && args[i + 1]) {
      propertyId = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      help = true;
    }
  }

  return { propertyId, help };
}

function deriveExpectedPasscodeName(lock: PropertyLock): string {
  if (lock.passcode_name) {
    return lock.passcode_name;
  }

  const propertyType = lock.property_type.toUpperCase();

  if (propertyType === 'HOME') {
    return 'permanent-visitor-home';
  }

  if (propertyType === 'ROOM') {
    const segments = lock.property_name.split('-');
    const lastSegment = segments[segments.length - 1];
    const roomNumber = parseInt(lastSegment, 10);
    if (!isNaN(roomNumber)) {
      return `permanent-visitor-room-${roomNumber}`;
    }
    return 'permanent-visitor-room';
  }

  if (propertyType === 'BUNDLE' || propertyType === 'MULTI_HOME') {
    return 'permanent-visitor-bundle';
  }

  return `permanent-visitor-${propertyType.toLowerCase().replace(/\s+/g, '-')}`;
}

async function fetchHostfullyDoorCode(
  propertyId: string,
  apiKey: string,
  baseUrl: string,
): Promise<string | null> {
  const url = `${baseUrl}/api/v3.2/custom-data?propertyUid=${encodeURIComponent(propertyId)}`;

  const response = await fetch(url, {
    headers: {
      'X-HOSTFULLY-APIKEY': apiKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Hostfully API returned ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { customData?: CustomDataEntry[] } | CustomDataEntry[];
  const entries: CustomDataEntry[] = Array.isArray(body) ? body : (body.customData ?? []);

  const doorCodeEntry = entries.find((entry) => entry.customDataField.name === 'door_code');
  return doorCodeEntry?.text ?? null;
}

async function queryPropertyLocks(
  supabaseUrl: string,
  supabaseKey: string,
  tenantId: string,
  propertyId: string,
): Promise<PropertyLock[]> {
  const url = `${supabaseUrl}/rest/v1/property_locks?tenant_id=eq.${encodeURIComponent(tenantId)}&property_external_id=eq.${encodeURIComponent(propertyId)}`;

  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`PostgREST query failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as PropertyLock[];
}

async function sifelyLogin(
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

async function sifelyListPasscodes(
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

async function sifelyListAccessRecords(
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

function buildDiagnosisSummary(
  hostfullyDoorCode: string,
  lockResults: LockDiagnosisResult[],
  hasMismatch: boolean,
): string {
  const summaryLines: string[] = [];

  if (hasMismatch) {
    summaryLines.push(`⚠️ CODE MISMATCH DETECTED — Hostfully door code: ${hostfullyDoorCode}`);
    for (const result of lockResults) {
      const lockLabel = result.lockRole
        ? `${result.lockName} (${result.lockRole})`
        : result.lockName;
      if (!result.passcodeFound) {
        summaryLines.push(
          `  ❌ ${lockLabel}: No passcode named "${result.expectedPasscodeName}" found`,
        );
      } else if (!result.matchesHostfully) {
        summaryLines.push(
          `  ❌ ${lockLabel}: passcode "${result.expectedPasscodeName}" does not match the Hostfully door code`,
        );
      } else {
        summaryLines.push(`  ✅ ${lockLabel}: matches`);
      }
    }
  } else {
    summaryLines.push(`✅ All lock codes match the door code (${hostfullyDoorCode})`);
  }

  for (const result of lockResults) {
    const lockLabel = result.lockRole ? `${result.lockName} (${result.lockRole})` : result.lockName;

    if (result.error) {
      summaryLines.push(`  ⚠️ ${lockLabel}: Error fetching data — ${result.error}`);
      continue;
    }

    if (result.accessRecords.length === 0) {
      summaryLines.push(`  🔒 ${lockLabel}: No access attempts in the last 2 hours`);
    } else {
      const passcodeAttempts = result.accessRecords.filter((r) => r.recordType === 4);
      const successful = passcodeAttempts.filter((r) => r.success === 1);
      const failed = passcodeAttempts.filter((r) => r.success === 0);

      if (successful.length > 0) {
        summaryLines.push(`  ✅ ${lockLabel}: ${successful.length} successful entry(ies)`);
      }
      if (failed.length > 0) {
        const wrongCodes = [...new Set(failed.map((r) => r.keyboardPwd))];
        summaryLines.push(
          `  ❌ ${lockLabel}: ${failed.length} failed attempt(s) with code(s): ${wrongCodes.join(', ')}`,
        );
      }
    }
  }

  return summaryLines.join('\n');
}

async function main(): Promise<void> {
  const { propertyId, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx diagnose-access.ts --property-id <hostfully-property-uid>\n\n' +
        'Cross-references Hostfully door codes against Sifely smart lock passcodes\n' +
        'and recent access records to diagnose guest lock access issues.\n\n' +
        'Options:\n' +
        '  --property-id <uid>    (required) Hostfully property UID\n' +
        '  --help                 Show this help message\n\n' +
        'Environment variables:\n' +
        '  HOSTFULLY_API_KEY      (required) Hostfully API key\n' +
        '  SIFELY_CLIENT_ID       (required) Sifely API client ID\n' +
        '  SIFELY_USERNAME        (required) Sifely account username\n' +
        '  SIFELY_PASSWORD        (required) Sifely account password\n' +
        '  SUPABASE_URL           (required) PostgREST base URL\n' +
        '  SUPABASE_SECRET_KEY    (required) PostgREST service role key\n' +
        '  TENANT_ID              (required) Tenant UUID\n' +
        '  HOSTFULLY_API_URL      (optional) Hostfully base URL (default: https://api.hostfully.com)\n' +
        '  SIFELY_BASE_URL        (optional) Sifely base URL (default: https://app-smart-server.sifely.com)\n\n' +
        'Output:\n' +
        '  JSON diagnosis object written to stdout\n\n' +
        'Example:\n' +
        '  tsx diagnose-access.ts --property-id c960c8d2-9a51-49d8-bb48-355a7bfbe7e2\n',
    );
    process.exit(0);
  }

  if (!propertyId) {
    process.stderr.write('Error: --property-id argument is required\n');
    process.exit(1);
  }

  const hostfullyApiKey = process.env['HOSTFULLY_API_KEY'];
  const sifelyClientId = process.env['SIFELY_CLIENT_ID'];
  const sifelyUsername = process.env['SIFELY_USERNAME'];
  const sifelyPassword = process.env['SIFELY_PASSWORD'];
  const supabaseUrl = process.env['SUPABASE_URL'];
  const supabaseKey = process.env['SUPABASE_SECRET_KEY'];
  const tenantId = process.env['TENANT_ID'];

  const missingVars: string[] = [];
  if (!hostfullyApiKey) missingVars.push('HOSTFULLY_API_KEY');
  if (!sifelyClientId) missingVars.push('SIFELY_CLIENT_ID');
  if (!sifelyUsername) missingVars.push('SIFELY_USERNAME');
  if (!sifelyPassword) missingVars.push('SIFELY_PASSWORD');
  if (!supabaseUrl) missingVars.push('SUPABASE_URL');
  if (!supabaseKey) missingVars.push('SUPABASE_SECRET_KEY');
  if (!tenantId) missingVars.push('TENANT_ID');

  if (missingVars.length > 0) {
    process.stderr.write(
      `Error: Missing required environment variables: ${missingVars.join(', ')}\n`,
    );
    process.exit(1);
  }

  const apiKey = hostfullyApiKey as string;
  const clientId = sifelyClientId as string;
  const username = sifelyUsername as string;
  const password = sifelyPassword as string;
  const postgrestUrl = supabaseUrl as string;
  const postgrestKey = supabaseKey as string;
  const tenant = tenantId as string;

  const hostfullyBaseUrl = (
    process.env['HOSTFULLY_API_URL'] ?? 'https://api.hostfully.com'
  ).replace(/\/$/, '');
  const sifelyBaseUrl = (
    process.env['SIFELY_BASE_URL'] ?? 'https://app-smart-server.sifely.com'
  ).replace(/\/$/, '');

  let hostfullyDoorCode: string | null = null;
  try {
    hostfullyDoorCode = await fetchHostfullyDoorCode(propertyId, apiKey, hostfullyBaseUrl);
  } catch (err) {
    process.stderr.write(`Warning: Failed to fetch Hostfully door code: ${String(err)}\n`);
  }

  if (hostfullyDoorCode === null) {
    const output: DiagnosisOutput = {
      propertyId,
      hostfullyDoorCode: null,
      locks: [],
      hasMismatch: false,
      diagnosisSummary: 'No door code found in Hostfully for this property',
    };
    process.stdout.write(JSON.stringify(output) + '\n');
    process.exit(0);
  }

  let propertyLocks: PropertyLock[] = [];
  try {
    propertyLocks = await queryPropertyLocks(postgrestUrl, postgrestKey, tenant, propertyId);
  } catch (err) {
    process.stderr.write(`Error: Failed to query property_locks: ${String(err)}\n`);
    process.exit(1);
  }

  if (propertyLocks.length === 0) {
    const output: DiagnosisOutput = {
      propertyId,
      hostfullyDoorCode,
      locks: [],
      hasMismatch: false,
      diagnosisSummary: 'No lock mappings found for this property',
    };
    process.stdout.write(JSON.stringify(output) + '\n');
    process.exit(0);
  }

  let sifelyToken: string;
  try {
    sifelyToken = await sifelyLogin(sifelyBaseUrl, clientId, username, password);
  } catch (err) {
    process.stderr.write(`Error: Sifely authentication failed: ${String(err)}\n`);
    process.exit(1);
  }

  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  const now = Date.now();

  const lockResults = await Promise.all(
    propertyLocks.map(async (lock): Promise<LockDiagnosisResult> => {
      const expectedPasscodeName = deriveExpectedPasscodeName(lock);
      let allPasscodes: LockPasscode[] = [];
      let accessRecords: AccessRecord[] = [];
      let fetchError: string | undefined;

      try {
        allPasscodes = await sifelyListPasscodes(sifelyBaseUrl, sifelyToken, lock.lock_external_id);
      } catch (err) {
        fetchError = String(err);
        process.stderr.write(
          `Warning: Failed to fetch passcodes for lock ${lock.lock_external_id}: ${fetchError}\n`,
        );
      }

      try {
        accessRecords = await sifelyListAccessRecords(
          sifelyBaseUrl,
          sifelyToken,
          lock.lock_external_id,
          twoHoursAgo,
          now,
        );
      } catch (err) {
        process.stderr.write(
          `Warning: Failed to fetch access records for lock ${lock.lock_external_id}: ${String(err)}\n`,
        );
      }

      const allPermanentPasscodes = allPasscodes.filter((p) => p.keyboardPwdType === 2);
      const matchedPasscode =
        allPermanentPasscodes.find((p) => p.keyboardPwdName === expectedPasscodeName) ?? null;

      const passcodeFound = matchedPasscode !== null;
      const matchesHostfully = passcodeFound && matchedPasscode.keyboardPwd === hostfullyDoorCode;

      const result: LockDiagnosisResult = {
        lockId: lock.lock_external_id,
        lockName: lock.lock_name,
        lockRole: lock.lock_role ?? null,
        expectedPasscodeName,
        matchedPasscode,
        allPermanentPasscodes,
        matchesHostfully,
        passcodeFound,
        accessRecords,
      };

      if (fetchError !== undefined) {
        result.error = fetchError;
      }

      return result;
    }),
  );

  const hasMismatch = lockResults.some((r) => !r.passcodeFound || !r.matchesHostfully);

  const diagnosisSummary = buildDiagnosisSummary(hostfullyDoorCode, lockResults, hasMismatch);

  const topLevelExpectedPasscodeName =
    lockResults.length > 0 ? lockResults[0].expectedPasscodeName : undefined;

  const output: DiagnosisOutput = {
    propertyId,
    hostfullyDoorCode,
    ...(topLevelExpectedPasscodeName !== undefined
      ? { expectedPasscodeName: topLevelExpectedPasscodeName }
      : {}),
    locks: lockResults,
    hasMismatch,
    diagnosisSummary,
  };

  process.stdout.write(JSON.stringify(output) + '\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
