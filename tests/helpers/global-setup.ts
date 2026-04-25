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
  const testEnv = { ...process.env, DATABASE_URL: TEST_DB_URL, DATABASE_URL_DIRECT: TEST_DB_URL };

  runWithRetry('pnpm prisma migrate deploy', { cwd: projectDir, stdio: 'inherit', env: testEnv });
  runWithRetry('pnpm db:seed', { cwd: projectDir, stdio: 'inherit', env: testEnv });
}

export function teardown() {}
