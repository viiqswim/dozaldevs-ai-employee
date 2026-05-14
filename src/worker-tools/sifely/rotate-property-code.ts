import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PropertyLockRow {
  tenant_id: string;
  property_external_id: string;
  lock_external_id: string;
  lock_name: string | null;
  passcode_name: string | null;
}

interface SifelyPasscode {
  keyboardPwdId: number;
  keyboardPwdName: string;
  keyboardPwd: string;
  keyboardPwdType: number;
}

interface LockResult {
  lockId: string;
  lockName: string;
  success: boolean;
  action?: 'updated' | 'created';
  passcodeId?: number;
  error?: string;
}

interface RotationResult {
  success: boolean;
  propertyId: string;
  newCode: string | null;
  expectedPasscodeName: string;
  hostfullyUpdated: boolean;
  hostfullyError: string | null;
  locks: LockResult[];
}

interface ToolResult {
  stdout: string;
  success: boolean;
  exitCode: number;
  error?: string;
}

function runTool(cmd: string): ToolResult {
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      env: { ...process.env },
      timeout: 30000,
    });
    return { stdout, success: true, exitCode: 0 };
  } catch (err: unknown) {
    const execError = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout ?? '',
      success: false,
      exitCode: execError.status ?? 1,
      error: execError.stderr ?? String(err),
    };
  }
}

function parseArgs(argv: string[]): { propertyId: string; code: string | null; help: boolean } {
  const args = argv.slice(2);
  let propertyId = '';
  let code: string | null = null;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--property-id' && args[i + 1]) {
      propertyId = args[++i] ?? '';
    } else if (args[i] === '--code' && args[i + 1]) {
      code = args[++i] ?? null;
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { propertyId, code, help };
}

const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'TENANT_ID',
  'SIFELY_USERNAME',
  'SIFELY_PASSWORD',
  'HOSTFULLY_API_KEY',
] as const;

function validateEnv(): void {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    process.stderr.write(`Error: Missing required environment variables: ${missing.join(', ')}\n`);
    process.exit(1);
  }
}

function toolPath(name: string): string {
  return path.join(__dirname, name);
}

async function main(): Promise<void> {
  const { propertyId, code: overrideCode, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx rotate-property-code.ts --property-id <hostfully-property-uid> [--code <code>]\n' +
        'Rotates the lock code for a single Hostfully property and its Sifely locks.\n' +
        'If --code is provided, that code is used directly (no new code is generated).\n\n' +
        'Options:\n' +
        '  --property-id <uid>  Hostfully property UID (required)\n' +
        '  --code <code>        Use this specific code instead of generating a new one\n' +
        '  --help               Show this help message\n\n' +
        'Environment variables:\n' +
        '  SUPABASE_URL         PostgREST base URL\n' +
        '  SUPABASE_SECRET_KEY  PostgREST auth key\n' +
        '  TENANT_ID            Tenant UUID\n' +
        '  SIFELY_USERNAME      Sifely account username\n' +
        '  SIFELY_PASSWORD      Sifely account password\n' +
        '  HOSTFULLY_API_KEY    Hostfully API key\n\n' +
        'Output:\n' +
        '  JSON object with success, newCode, hostfullyUpdated, and per-lock results\n',
    );
    process.exit(0);
  }

  if (!propertyId) {
    process.stderr.write('Error: --property-id argument is required\n');
    process.exit(1);
  }

  validateEnv();

  const supabaseUrl = process.env['SUPABASE_URL']!;
  const supabaseKey = process.env['SUPABASE_SECRET_KEY']!;
  const tenantId = process.env['TENANT_ID']!;

  const url =
    `${supabaseUrl}/rest/v1/property_locks` +
    `?tenant_id=eq.${encodeURIComponent(tenantId)}` +
    `&property_external_id=eq.${encodeURIComponent(propertyId)}` +
    `&select=*`;

  let rows: PropertyLockRow[];
  try {
    const response = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      process.stdout.write(
        JSON.stringify({
          success: false,
          error: `PostgREST error ${String(response.status)}: ${body}`,
          propertyId,
        }) + '\n',
      );
      process.exit(1);
    }

    rows = (await response.json()) as PropertyLockRow[];
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        success: false,
        error: `Failed to query property_locks: ${String(err)}`,
        propertyId,
      }) + '\n',
    );
    process.exit(1);
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    process.stdout.write(
      JSON.stringify({
        success: false,
        error: 'No locks found for property',
        propertyId,
      }) + '\n',
    );
    process.exit(0);
  }

  const firstRow = rows[0]!;
  const expectedPasscodeName =
    firstRow.passcode_name && firstRow.passcode_name.trim().length > 0
      ? firstRow.passcode_name.trim()
      : 'permanent-visitor-home';

  const uniqueLockIds = [...new Set(rows.map((r) => r.lock_external_id))];
  const allCurrentCodes: string[] = [];

  for (const lockId of uniqueLockIds) {
    const listResult = runTool(
      `pnpm exec tsx ${toolPath('sifely-client.ts')} --action list-passcodes --lock-id ${lockId}`,
    );
    if (listResult.success && listResult.stdout.trim()) {
      try {
        const passcodes = JSON.parse(listResult.stdout.trim()) as SifelyPasscode[];
        if (Array.isArray(passcodes)) {
          for (const p of passcodes) {
            if (p.keyboardPwd) allCurrentCodes.push(p.keyboardPwd);
          }
        }
      } catch {
        process.stderr.write(
          `Warning: Could not parse passcodes for lock ${lockId}: ${listResult.stdout}\n`,
        );
      }
    } else if (!listResult.success) {
      process.stderr.write(
        `Warning: Could not list passcodes for lock ${lockId}: ${listResult.error ?? ''}\n`,
      );
    }
  }

  let newCode: string;

  if (overrideCode) {
    newCode = overrideCode;
  } else {
    const excludeArg =
      allCurrentCodes.length > 0 ? `--exclude-codes "${allCurrentCodes.join(',')}"` : '';
    const generateResult = runTool(
      `pnpm exec tsx ${toolPath('generate-code.ts')} ${excludeArg}`.trim(),
    );

    if (!generateResult.success || !generateResult.stdout.trim()) {
      process.stdout.write(
        JSON.stringify({
          success: false,
          error: `Failed to generate code: ${generateResult.error ?? generateResult.stdout}`,
          propertyId,
        }) + '\n',
      );
      process.exit(1);
    }

    try {
      const genOutput = JSON.parse(generateResult.stdout.trim()) as { code: string };
      newCode = genOutput.code;
      if (!newCode) throw new Error('code field missing');
    } catch {
      process.stdout.write(
        JSON.stringify({
          success: false,
          error: `Failed to parse generate-code output: ${generateResult.stdout}`,
          propertyId,
        }) + '\n',
      );
      process.exit(1);
    }
  }

  let hostfullyUpdated = false;
  let hostfullyError: string | null = null;

  const hostfullyResult = runTool(
    `pnpm exec tsx ${toolPath('update-door-code.ts')} --property-id ${propertyId} --code ${newCode}`,
  );

  if (hostfullyResult.success) {
    hostfullyUpdated = true;
  } else if (hostfullyResult.exitCode === 2) {
    hostfullyUpdated = false;
    hostfullyError = 'door_code field not found';
  } else {
    hostfullyUpdated = false;
    hostfullyError =
      (hostfullyResult.error ?? hostfullyResult.stdout).trim() || 'Hostfully API error';
  }

  const lockResults: LockResult[] = [];

  for (const lockId of uniqueLockIds) {
    const lockRow = rows.find((r) => r.lock_external_id === lockId);
    const lockName = lockRow?.lock_name ?? lockId;

    const listResult = runTool(
      `pnpm exec tsx ${toolPath('sifely-client.ts')} --action list-passcodes --lock-id ${lockId}`,
    );

    let passcodes: SifelyPasscode[] = [];
    if (listResult.success && listResult.stdout.trim()) {
      try {
        const parsed = JSON.parse(listResult.stdout.trim()) as SifelyPasscode[];
        if (Array.isArray(parsed)) passcodes = parsed;
      } catch {
        lockResults.push({
          lockId,
          lockName,
          success: false,
          error: `Failed to parse passcode list: ${listResult.stdout}`,
        });
        continue;
      }
    } else if (!listResult.success) {
      lockResults.push({
        lockId,
        lockName,
        success: false,
        error: `Failed to list passcodes: ${listResult.error ?? listResult.stdout}`,
      });
      continue;
    }

    const match = passcodes.find(
      (p) =>
        p.keyboardPwdName.toLowerCase() === expectedPasscodeName.toLowerCase() &&
        p.keyboardPwdType === 2,
    );

    if (match) {
      const updateResult = runTool(
        `pnpm exec tsx ${toolPath('sifely-client.ts')} --action update-passcode --lock-id ${lockId} --passcode-id ${String(match.keyboardPwdId)} --code ${newCode}`,
      );

      if (updateResult.success) {
        lockResults.push({
          lockId,
          lockName,
          success: true,
          action: 'updated',
          passcodeId: match.keyboardPwdId,
        });
      } else {
        lockResults.push({
          lockId,
          lockName,
          success: false,
          error: `Failed to update passcode: ${updateResult.error ?? updateResult.stdout}`,
        });
      }
    } else {
      const createResult = runTool(
        `pnpm exec tsx ${toolPath('sifely-client.ts')} --action create-passcode --lock-id ${lockId} --name "${expectedPasscodeName}" --code ${newCode}`,
      );

      if (createResult.success && createResult.stdout.trim()) {
        let createdId: number | undefined;
        try {
          const created = JSON.parse(createResult.stdout.trim()) as { keyboardPwdId?: number };
          createdId = created.keyboardPwdId;
        } catch {
          createdId = undefined;
        }
        lockResults.push({
          lockId,
          lockName,
          success: true,
          action: 'created',
          ...(createdId !== undefined ? { passcodeId: createdId } : {}),
        });
      } else {
        lockResults.push({
          lockId,
          lockName,
          success: false,
          error: `Failed to create passcode: ${createResult.error ?? createResult.stdout}`,
        });
      }
    }
  }

  const allLocksSucceeded = lockResults.length > 0 && lockResults.every((l) => l.success);

  const result: RotationResult = {
    success: allLocksSucceeded,
    propertyId,
    newCode,
    expectedPasscodeName,
    hostfullyUpdated,
    hostfullyError,
    locks: lockResults,
  };

  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

main().catch((err) => {
  process.stdout.write(
    JSON.stringify({ success: false, error: String(err), propertyId: '' }) + '\n',
  );
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
