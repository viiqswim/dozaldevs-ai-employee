import { describe, it, expect } from 'vitest';
import { execSync, spawnSync } from 'child_process';

const DOCKER_AVAILABLE = (() => {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
})();

const SUPABASE_AVAILABLE = (() => {
  try {
    const code = execSync(
      'curl -s http://localhost:54321/rest/v1/ -o /dev/null -w "%{http_code}"',
      { encoding: 'utf-8', timeout: 3000 },
    ).trim();
    return code !== '000';
  } catch {
    return false;
  }
})();

const INTEGRATION_AVAILABLE = DOCKER_AVAILABLE && SUPABASE_AVAILABLE;

describe.skipIf(!INTEGRATION_AVAILABLE)('Container Boot Integration', () => {
  it('verify-docker script passes', () => {
    const result = spawnSync('bash', ['scripts/verify-docker.sh'], {
      encoding: 'utf-8',
      timeout: 120_000,
    });

    if (result.status !== 0) {
      console.error('stdout:', result.stdout);
      console.error('stderr:', result.stderr);
    }

    expect(result.status).toBe(0);
  });

  it('container boots and exits cleanly', () => {
    const result = spawnSync('bash', ['scripts/verify-container-boot.sh'], {
      encoding: 'utf-8',
      timeout: 120_000,
    });

    if (result.status !== 0) {
      console.error('stdout:', result.stdout);
      console.error('stderr:', result.stderr);
    }

    expect(result.status).toBe(0);
  });

  it('entrypoint.sh passes bash syntax check', () => {
    const result = spawnSync('bash', ['-n', 'src/workers/entrypoint.sh'], {
      encoding: 'utf-8',
      timeout: 10_000,
    });

    if (result.status !== 0) {
      console.error('stderr:', result.stderr);
    }

    expect(result.status).toBe(0);
  });

  it('container logs contain all 8 steps', () => {
    const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
    const supabaseUrl = SUPABASE_URL ?? 'http://localhost:54321';

    if (!SUPABASE_SECRET_KEY) {
      console.warn('Skipping step-log test: SUPABASE_SECRET_KEY not set in environment');
      return;
    }

    const TEST_TASK_ID = '33333333-3333-3333-3333-333333333333';
    const IMAGE = process.env.WORKER_IMAGE ?? 'ai-employee-worker';

    const result = spawnSync(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'host',
        '-e',
        `TASK_ID=${TEST_TASK_ID}`,
        '-e',
        'REPO_URL=https://github.com/antfu/ni',
        '-e',
        'REPO_BRANCH=main',
        '-e',
        `SUPABASE_URL=${supabaseUrl}`,
        '-e',
        `SUPABASE_SECRET_KEY=${SUPABASE_SECRET_KEY}`,
        IMAGE,
      ],
      { encoding: 'utf-8', timeout: 120_000 },
    );

    const combined = (result.stdout ?? '') + (result.stderr ?? '');

    for (let step = 1; step <= 8; step++) {
      expect(combined).toContain(`[STEP ${step}/8]`);
    }
  });
});
