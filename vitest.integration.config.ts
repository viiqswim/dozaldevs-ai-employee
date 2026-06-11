import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

import { defineConfig } from 'vitest/config';

const resolveJsToTs = {
  name: 'resolve-ts-js-extension',
  enforce: 'pre' as const,
  resolveId(source: string, importer: string | undefined): string | null {
    if (!importer || !source.endsWith('.js')) return null;
    const importerPath = importer.startsWith('file://') ? fileURLToPath(importer) : importer;
    const dir = dirname(importerPath);
    const base = resolvePath(dir, source.slice(0, -3));
    for (const ext of ['.ts', '.mts', '.cts']) {
      const candidate = `${base}${ext}`;
      if (existsSync(candidate)) return candidate;
    }
    return null;
  },
};

export default defineConfig({
  plugins: [resolveJsToTs],
  test: {
    include: ['tests/integration/**/*.test.ts', 'tests/integration/**/*.test.mts'],
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/ai_employee_test',
      SUPABASE_URL: 'http://localhost:54331',
      SUPABASE_SECRET_KEY: 'test-supabase-service-role-key',
      SUPABASE_ANON_KEY: 'eyJ-test-anon-key-local-profile',
      ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000001',
      INNGEST_DEV: '1',
    },
    server: {
      deps: {
        inline: [/src\/worker-tools/],
      },
    },
    globalSetup: './tests/helpers/global-setup.ts',
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 30000,
  },
});
