import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts', 'tests/integration/**/*.test.mts'],
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/ai_employee_test',
      SUPABASE_URL: 'http://localhost:54331',
      SUPABASE_SECRET_KEY: 'test-supabase-service-role-key',
      SUPABASE_ANON_KEY: 'eyJ-test-anon-key-local-profile',
      ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000001',
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
