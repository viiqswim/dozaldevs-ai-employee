import { vi } from 'vitest';
import type { Mock } from 'vitest';
import { mockCtx } from '@inngest/test';

/**
 * Reusable mock factory for Inngest lifecycle tests.
 *
 * `createLifecycleMocks()` returns plain objects of `vi.fn()` stubs — one per
 * side-effecting module the universal lifecycle (`src/inngest/employee-lifecycle.ts`)
 * and its approval handler (`src/inngest/lifecycle/steps/approval-handler.ts`)
 * import: fly-client, tunnel-client, tenant-env-loader, the two tenant
 * repositories, the Slack `@slack/web-api` WebClient, and the worker
 * postgrest-client. It does NOT call `vi.mock()` itself — hand each key to a
 * `vi.mock()` factory:
 *
 * ```ts
 * import { it, expect, vi } from 'vitest';
 * import * as flyClient from '../../../src/lib/fly-client.js';
 * import { loadTenantEnv } from '../../../src/repositories/tenant-env-loader.js';
 * import { createLifecycleMocks } from '../../helpers/lifecycle-mocks.js';
 *
 * vi.mock('../../../src/lib/fly-client.js', () => createLifecycleMocks().flyClient);
 * vi.mock('../../../src/repositories/tenant-env-loader.js', () =>
 *   createLifecycleMocks().tenantEnvLoader,
 * );
 *
 * it('runs the executing step', () => {
 *   vi.mocked(flyClient.createMachine).mockResolvedValueOnce({ id: 'm1', state: 'started' });
 *   // ...drive the lifecycle...
 *   expect(flyClient.createMachine).toHaveBeenCalledOnce();
 *   expect(vi.mocked(loadTenantEnv)).toHaveBeenCalled();
 * });
 * ```
 *
 * Each `vi.mock()` factory runs `createLifecycleMocks()` independently, so assert
 * on the imported (now-mocked) binding rather than a separate factory result.
 *
 * `TenantRepository`, `TenantSecretRepository`, and `WebClient` are constructed
 * inside the lifecycle (`new TenantRepository(prisma)` etc.). Their mock is a
 * constructor `vi.fn()` returning a shared instance, exposed on `instances` for
 * overriding/asserting:
 *
 * ```ts
 * const mocks = createLifecycleMocks();
 * vi.mock('../../../src/repositories/tenant-repository.js', () => mocks.tenantRepository);
 * mocks.instances.tenantRepository.findById.mockResolvedValue({ id: 't1', slug: 'vlre' });
 * ```
 *
 * Every stub ships an overridable default — override per test with
 * `.mockResolvedValue(...)` / `.mockResolvedValueOnce(...)` / `.mockImplementation(...)`.
 */

export interface FlyClientMock {
  createMachine: Mock;
  destroyMachine: Mock;
  getMachine: Mock;
  waitForMachine: Mock;
}

export interface TunnelClientMock {
  getTunnelUrl: Mock;
}

export interface TenantEnvLoaderMock {
  loadTenantEnv: Mock;
}

export interface TenantRepositoryInstance {
  findById: Mock;
  findBySlug: Mock;
  create: Mock;
  list: Mock;
  update: Mock;
  softDelete: Mock;
  restore: Mock;
}

export interface TenantRepositoryMock {
  TenantRepository: Mock;
}

export interface TenantSecretRepositoryInstance {
  get: Mock;
  getMany: Mock;
  listKeys: Mock;
  set: Mock;
  delete: Mock;
}

export interface TenantSecretRepositoryMock {
  TenantSecretRepository: Mock;
}

export interface SlackWebClientInstance {
  chat: {
    postMessage: Mock;
    update: Mock;
  };
}

export interface SlackWebApiMock {
  WebClient: Mock;
}

export interface PostgrestClientMock {
  query: Mock;
  insert: Mock;
  update: Mock;
  createPostgRESTClient: Mock;
}

export interface LifecycleMockInstances {
  tenantRepository: TenantRepositoryInstance;
  tenantSecretRepository: TenantSecretRepositoryInstance;
  slackWebClient: SlackWebClientInstance;
}

export interface LifecycleMocks {
  flyClient: FlyClientMock;
  tunnelClient: TunnelClientMock;
  tenantEnvLoader: TenantEnvLoaderMock;
  tenantRepository: TenantRepositoryMock;
  tenantSecretRepository: TenantSecretRepositoryMock;
  slackWebApi: SlackWebApiMock;
  postgrestClient: PostgrestClientMock;
  instances: LifecycleMockInstances;
}

const DEFAULT_FLY_MACHINE = { id: 'mock-machine-id', state: 'started', name: 'mock-machine' };

const DEFAULT_TENANT_ENV: Record<string, string> = {
  SUPABASE_URL: 'http://localhost:54331',
  SUPABASE_SECRET_KEY: 'test-supabase-secret-key',
  SLACK_BOT_TOKEN: 'xoxb-test-bot-token',
  NOTIFICATION_CHANNEL: 'C-MOCK-NOTIFY',
};

const DEFAULT_TENANT = {
  id: '00000000-0000-0000-0000-000000000002',
  name: 'Mock Tenant',
  slug: 'mock-tenant',
  config: {},
  status: 'active',
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  deleted_at: null,
};

const DEFAULT_SLACK_RESPONSE = {
  ok: true,
  ts: 'mock-ts-1700000000.000100',
  channel: 'C-MOCK-NOTIFY',
};

export function createLifecycleMocks(): LifecycleMocks {
  const flyClient: FlyClientMock = {
    createMachine: vi.fn().mockResolvedValue({ ...DEFAULT_FLY_MACHINE }),
    destroyMachine: vi.fn().mockResolvedValue(undefined),
    getMachine: vi.fn().mockResolvedValue({ ...DEFAULT_FLY_MACHINE }),
    waitForMachine: vi.fn().mockResolvedValue({ ...DEFAULT_FLY_MACHINE }),
  };

  const tunnelClient: TunnelClientMock = {
    getTunnelUrl: vi.fn().mockResolvedValue('https://mock-tunnel.example.com'),
  };

  const tenantEnvLoader: TenantEnvLoaderMock = {
    loadTenantEnv: vi.fn().mockResolvedValue({ ...DEFAULT_TENANT_ENV }),
  };

  const tenantRepositoryInstance: TenantRepositoryInstance = {
    findById: vi.fn().mockResolvedValue({ ...DEFAULT_TENANT }),
    findBySlug: vi.fn().mockResolvedValue({ ...DEFAULT_TENANT }),
    create: vi.fn().mockResolvedValue({ ...DEFAULT_TENANT }),
    list: vi.fn().mockResolvedValue([{ ...DEFAULT_TENANT }]),
    update: vi.fn().mockResolvedValue({ ...DEFAULT_TENANT }),
    softDelete: vi
      .fn()
      .mockResolvedValue({ ...DEFAULT_TENANT, deleted_at: new Date(0).toISOString() }),
    restore: vi.fn().mockResolvedValue({ ...DEFAULT_TENANT }),
  };
  const tenantRepository: TenantRepositoryMock = {
    TenantRepository: vi.fn(() => tenantRepositoryInstance),
  };

  const tenantSecretRepositoryInstance: TenantSecretRepositoryInstance = {
    get: vi.fn().mockResolvedValue(null),
    getMany: vi.fn().mockResolvedValue({}),
    listKeys: vi.fn().mockResolvedValue([]),
    set: vi.fn().mockResolvedValue({ key: 'mock_key', is_set: true, updated_at: new Date(0) }),
    delete: vi.fn().mockResolvedValue(true),
  };
  const tenantSecretRepository: TenantSecretRepositoryMock = {
    TenantSecretRepository: vi.fn(() => tenantSecretRepositoryInstance),
  };

  const slackWebClientInstance: SlackWebClientInstance = {
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ...DEFAULT_SLACK_RESPONSE }),
      update: vi.fn().mockResolvedValue({ ...DEFAULT_SLACK_RESPONSE }),
    },
  };
  const slackWebApi: SlackWebApiMock = {
    WebClient: vi.fn(() => slackWebClientInstance),
  };

  const postgrestClient: PostgrestClientMock = {
    query: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue([]),
    createPostgRESTClient: vi.fn(() => ({
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn().mockResolvedValue(null),
      patch: vi.fn().mockResolvedValue(null),
    })),
  };

  return {
    flyClient,
    tunnelClient,
    tenantEnvLoader,
    tenantRepository,
    tenantSecretRepository,
    slackWebApi,
    postgrestClient,
    instances: {
      tenantRepository: tenantRepositoryInstance,
      tenantSecretRepository: tenantSecretRepositoryInstance,
      slackWebClient: slackWebClientInstance,
    },
  };
}

export interface StepMockOverrides {
  run?: Mock;
  waitForEvent?: Mock;
  sendEvent?: Mock;
}

/**
 * Canonical `transformCtx` helper for lifecycle tests: runs `@inngest/test`'s
 * `mockCtx(rawCtx)`, assigns the supplied step-method mocks onto `ctx.step`,
 * and returns the mocked context. Replaces the repeated inline mutation of the
 * step object every lifecycle test used to do — the one unavoidable cast (the
 * `@inngest/test` `Context.Any` type exposes no typed mock surface for
 * `step.run`/`waitForEvent`/`sendEvent`) lives here, so callers stay `any`-free.
 *
 * ```ts
 * transformCtx: (ctx) => applyStepMocks(ctx, { run: stepRunMock, waitForEvent: waitForEventMock }),
 * ```
 */
export function applyStepMocks(
  rawCtx: unknown,
  overrides: StepMockOverrides,
): ReturnType<typeof mockCtx> {
  const ctx = mockCtx(rawCtx as Parameters<typeof mockCtx>[0]);
  const step = (ctx as unknown as { step: Record<string, unknown> }).step;
  if (overrides.run) step.run = overrides.run;
  if (overrides.waitForEvent) step.waitForEvent = overrides.waitForEvent;
  if (overrides.sendEvent) step.sendEvent = overrides.sendEvent;
  return ctx;
}
