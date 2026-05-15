import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [
      // Deprecated engineering worker lib tests (keep opencode-server and postgrest-client — active)
      'tests/workers/lib/!(opencode-server|postgrest-client).test.ts',
      // Deprecated engineering worker tests
      'tests/workers/orchestrate.test.ts',
      'tests/workers/entrypoint.test.ts',
      'tests/workers/install-runner.test.ts',
      'tests/workers/tooling-config-install.test.ts',
      'tests/workers/harness-placeholder-validation.test.ts',
      // Deprecated engineering worker config tests
      'tests/workers/config/**',
      // Deprecated tool registry tests
      'tests/workers/tools/**',
      // Deprecated inngest functions
      'tests/inngest/redispatch.test.ts',
      'tests/inngest/watchdog.test.ts',
      'tests/inngest/learned-rules-expiry.test.ts',
      'tests/inngest/triggers/summarizer-trigger.test.ts',
    ],
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
