import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/ai_employee_test',
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
