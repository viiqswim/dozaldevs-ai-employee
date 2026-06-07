import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/**/*.test.ts',
      'src/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.mts',
    ],
    exclude: [],
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/ai_employee_test',
      SUPABASE_URL: 'http://localhost:54331',
      SUPABASE_SECRET_KEY: 'test-supabase-service-role-key',
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
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html'],
    all: true,
    include: ['src/**/*.ts', 'src/**/*.mts'],
    exclude: [
      'src/**/__tests__/**',
      'src/**/*.test.ts',
      'src/**/*.test.mts',
      'src/worker-tools/lib/**',
      'src/worker-tools/*/lib/**',
      'src/worker-tools/notion/lib/**',
    ],
  },
});
