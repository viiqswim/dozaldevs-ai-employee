import { describe, it, expect } from 'vitest';
import { createLifecycleMocks } from '../../helpers/lifecycle-mocks.js';

describe('createLifecycleMocks', () => {
  it('returns a stub object for every lifecycle module', () => {
    const mocks = createLifecycleMocks();

    expect(mocks.flyClient.createMachine).toBeTypeOf('function');
    expect(mocks.flyClient.destroyMachine).toBeTypeOf('function');
    expect(mocks.tunnelClient.getTunnelUrl).toBeTypeOf('function');
    expect(mocks.tenantEnvLoader.loadTenantEnv).toBeTypeOf('function');
    expect(mocks.tenantRepository.TenantRepository).toBeTypeOf('function');
    expect(mocks.tenantSecretRepository.TenantSecretRepository).toBeTypeOf('function');
    expect(mocks.slackWebApi.WebClient).toBeTypeOf('function');
    expect(mocks.postgrestClient.query).toBeTypeOf('function');
    expect(mocks.postgrestClient.insert).toBeTypeOf('function');
    expect(mocks.postgrestClient.update).toBeTypeOf('function');
  });

  it('fly-client stubs resolve a started machine by default', async () => {
    const mocks = createLifecycleMocks();

    const machine = await mocks.flyClient.createMachine('app', { image: 'img' });
    expect(machine).toMatchObject({ state: 'started' });
    expect(mocks.flyClient.createMachine).toHaveBeenCalledWith('app', { image: 'img' });

    await expect(mocks.flyClient.destroyMachine('app', 'm1')).resolves.toBeUndefined();
  });

  it('tunnel + tenant-env stubs resolve sensible defaults', async () => {
    const mocks = createLifecycleMocks();

    await expect(mocks.tunnelClient.getTunnelUrl()).resolves.toContain('https://');

    const env = (await mocks.tenantEnvLoader.loadTenantEnv('tenant-1', {})) as Record<
      string,
      string
    >;
    expect(env.SLACK_BOT_TOKEN).toBeTruthy();
    expect(env.SUPABASE_URL).toBeTruthy();
  });

  it('repository + WebClient constructors yield the shared overridable instance', async () => {
    const mocks = createLifecycleMocks();

    const TenantRepositoryCtor = mocks.tenantRepository.TenantRepository as unknown as new (
      ...args: unknown[]
    ) => typeof mocks.instances.tenantRepository;
    const repo = new TenantRepositoryCtor({});
    expect(repo).toBe(mocks.instances.tenantRepository);

    mocks.instances.tenantRepository.findById.mockResolvedValueOnce({ id: 't1', slug: 'vlre' });
    await expect(repo.findById('t1')).resolves.toMatchObject({ slug: 'vlre' });

    const WebClientCtor = mocks.slackWebApi.WebClient as unknown as new (
      ...args: unknown[]
    ) => typeof mocks.instances.slackWebClient;
    const web = new WebClientCtor('xoxb-token');
    expect(web).toBe(mocks.instances.slackWebClient);
    await expect(web.chat.postMessage({})).resolves.toMatchObject({ ok: true });
  });

  it('postgrest stubs are independent between factory calls', async () => {
    const a = createLifecycleMocks();
    const b = createLifecycleMocks();

    await a.postgrestClient.query('tasks', 'id=eq.1');
    expect(a.postgrestClient.query).toHaveBeenCalledTimes(1);
    expect(b.postgrestClient.query).not.toHaveBeenCalled();
  });
});
