import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { getPrisma, disconnectPrisma } from '../setup.js';

afterAll(async () => {
  await disconnectPrisma();
});

describe('agents_md migration', () => {
  it('agents_md column exists on archetypes table', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'archetypes'
      AND column_name = 'agents_md'
    `;
    expect(result).toHaveLength(1);
  });

  it('agents_md column has type text', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ data_type: string }>>`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'archetypes'
      AND column_name = 'agents_md'
    `;
    expect(result[0].data_type).toBe('text');
  });

  it('agents_md column is nullable', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'archetypes'
      AND column_name = 'agents_md'
    `;
    expect(result[0].is_nullable).toBe('YES');
  });

  it('agents_md column has no default value', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ column_default: string | null }>>`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'archetypes'
      AND column_name = 'agents_md'
    `;
    expect(result[0].column_default).toBeNull();
  });
});

describe('Seed data verification', () => {
  const DOZALDEVS_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000012';
  const VLRE_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000013';
  const DOZALDEVS_TENANT_ID = '00000000-0000-0000-0000-000000000002';
  const VLRE_TENANT_ID = '00000000-0000-0000-0000-000000000003';

  const staticFilePath = new URL('../../src/workers/config/agents.md', import.meta.url).pathname;

  it('Archetype agents_md is seeded (DozalDevs)', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ agents_md: string | null }>>`
      SELECT agents_md FROM archetypes WHERE id = ${DOZALDEVS_ARCHETYPE_ID}::uuid
    `;
    expect(result).toHaveLength(1);
    expect(result[0].agents_md).not.toBeNull();
    expect((result[0].agents_md as string).length).toBeGreaterThan(0);
  });

  it('Archetype agents_md is seeded (VLRE)', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ agents_md: string | null }>>`
      SELECT agents_md FROM archetypes WHERE id = ${VLRE_ARCHETYPE_ID}::uuid
    `;
    expect(result).toHaveLength(1);
    expect(result[0].agents_md).not.toBeNull();
    expect((result[0].agents_md as string).length).toBeGreaterThan(0);
  });

  it('Archetype agents_md matches static file (DozalDevs)', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ agents_md: string | null }>>`
      SELECT agents_md FROM archetypes WHERE id = ${DOZALDEVS_ARCHETYPE_ID}::uuid
    `;
    const staticContent = readFileSync(staticFilePath, 'utf-8');
    expect(result[0].agents_md).toBe(staticContent);
  });

  it('Tenant config default_agents_md is seeded (DozalDevs)', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ default_agents_md: string | null }>>`
      SELECT config->>'default_agents_md' as default_agents_md FROM tenants WHERE id = ${DOZALDEVS_TENANT_ID}::uuid
    `;
    expect(result).toHaveLength(1);
    expect(result[0].default_agents_md).not.toBeNull();
  });

  it('Tenant config default_agents_md is seeded (VLRE)', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ default_agents_md: string | null }>>`
      SELECT config->>'default_agents_md' as default_agents_md FROM tenants WHERE id = ${VLRE_TENANT_ID}::uuid
    `;
    expect(result).toHaveLength(1);
    expect(result[0].default_agents_md).not.toBeNull();
  });

  it('Tenant default_agents_md matches static file', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<Array<{ default_agents_md: string | null }>>`
      SELECT config->>'default_agents_md' as default_agents_md FROM tenants WHERE id = ${DOZALDEVS_TENANT_ID}::uuid
    `;
    const staticContent = readFileSync(staticFilePath, 'utf-8');
    expect(result[0].default_agents_md).toBe(staticContent);
  });
});
