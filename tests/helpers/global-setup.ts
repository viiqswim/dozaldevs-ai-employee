import { execSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DB_URL = 'postgresql://postgres:postgres@localhost:54322/ai_employee_test';

function runWithRetry(
  cmd: string,
  opts: Parameters<typeof execSync>[1],
  maxRetries = 3,
  delayMs = 2000,
): void {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      execSync(cmd, opts);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        console.warn(
          `⚠️ Command failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs / 1000}s...`,
        );
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
      }
    }
  }
  throw lastError;
}

function isMigrationCurrent(projectDir: string, testEnv: NodeJS.ProcessEnv): boolean {
  try {
    const output = execSync('pnpm prisma migrate status', {
      cwd: projectDir,
      env: testEnv,
      stdio: 'pipe',
    }).toString();
    return output.includes('Database schema is up to date!');
  } catch {
    // Non-zero exit means pending migrations — return false to trigger deploy
    return false;
  }
}

function isSeedPresent(): boolean {
  try {
    const output = execSync(
      `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres ai_employee_test -t -c "SELECT COUNT(*) FROM tenants" 2>/dev/null`,
      { stdio: 'pipe' },
    ).toString();
    const count = parseInt(output.trim(), 10);
    return count > 0;
  } catch {
    return false;
  }
}

export function setup() {
  const projectDir = resolve(__dirname, '../..');

  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.DATABASE_URL_DIRECT = TEST_DB_URL;

  if (!process.env.DATABASE_URL.includes('ai_employee_test')) {
    throw new Error(
      `Integration tests MUST use ai_employee_test database. Got: ${process.env.DATABASE_URL}. ` +
        `This prevents accidental data loss on non-test databases.`,
    );
  }

  // prisma.config.ts skips keys already in process.env (line 13: `key in process.env`),
  // so DATABASE_URL from .env will NOT override the test URL we set above.
  //
  // The vitest `env:` block (vitest.integration.config.ts) is injected into test WORKERS,
  // NOT into this globalSetup context. In CI (no .env file) these vars are undefined, so
  // the seed's AES-256-GCM encryption throws "RangeError: Invalid key length". Provide
  // safe fallbacks here — `?? default` ensures a real local .env value is never overridden.
  const testEnv = {
    ...process.env,
    DATABASE_URL: TEST_DB_URL,
    DATABASE_URL_DIRECT: TEST_DB_URL,
    // Must match the ENCRYPTION_KEY in vitest.integration.config.ts so secrets encrypted
    // at seed time can be decrypted by integration tests.
    ENCRYPTION_KEY:
      process.env.ENCRYPTION_KEY ??
      '0000000000000000000000000000000000000000000000000000000000000001',
    VLRE_SLACK_BOT_TOKEN: process.env.VLRE_SLACK_BOT_TOKEN ?? 'xoxb-test-vlre-bot-token',
  };

  if (isMigrationCurrent(projectDir, testEnv)) {
    console.log('✅ Migrations already up to date — skipping migrate deploy');
  } else {
    console.log('🔄 Pending migrations detected — running migrate deploy...');
    runWithRetry('pnpm prisma migrate deploy', { cwd: projectDir, stdio: 'inherit', env: testEnv });
  }

  if (isSeedPresent()) {
    console.log('✅ Seed data already present — skipping db:seed');
  } else {
    console.log('🌱 No seed data found — running db:seed...');
    runWithRetry('pnpm db:seed', { cwd: projectDir, stdio: 'inherit', env: testEnv });
  }
}

export async function teardown() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: TEST_DB_URL } },
  });
  try {
    await prisma.$disconnect();
  } catch {
    // Ignore disconnect errors — process is exiting anyway
  }
}
