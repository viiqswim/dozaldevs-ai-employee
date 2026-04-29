import { describe, it, expect, afterAll } from 'vitest';
import { getPrisma, disconnectPrisma } from '../setup.js';

const VLRE_TENANT_ID = '00000000-0000-0000-0000-000000000003';
const DOZALDEVS_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const COMMON_KB_ID = '00000000-0000-0000-0000-000000000100';
const ENTITY_KB_ID = '00000000-0000-0000-0000-000000000101';
const VLRE_TEST_PROPERTY_UID = 'vlre-3505-ban';

afterAll(async () => {
  await disconnectPrisma();
});

describe('knowledge_base_entries — seed verification', () => {
  it('10 KB rows exist for VLRE tenant', async () => {
    const prisma = getPrisma();
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint FROM knowledge_base_entries
      WHERE tenant_id = ${VLRE_TENANT_ID}::uuid
    `;
    expect(Number(rows[0].count)).toBe(10);
  });

  it('common KB row has correct scope, entity_type null, entity_id null', async () => {
    const prisma = getPrisma();
    const rows = await prisma.$queryRaw<
      { scope: string; entity_type: string | null; entity_id: string | null; content: string }[]
    >`
      SELECT scope, entity_type, entity_id, content FROM knowledge_base_entries
      WHERE id = ${COMMON_KB_ID}::uuid
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('common');
    expect(rows[0].entity_type).toBeNull();
    expect(rows[0].entity_id).toBeNull();
    expect(rows[0].content.length).toBeGreaterThan(100);
    expect(rows[0].content).toContain('General Policies');
  });

  it('entity KB row has correct scope, entity_type=property, entity_id=VLRE test property UID', async () => {
    const prisma = getPrisma();
    const rows = await prisma.$queryRaw<
      { scope: string; entity_type: string; entity_id: string; content: string }[]
    >`
      SELECT scope, entity_type, entity_id, content FROM knowledge_base_entries
      WHERE id = ${ENTITY_KB_ID}::uuid
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('entity');
    expect(rows[0].entity_type).toBe('property');
    expect(rows[0].entity_id).toBe(VLRE_TEST_PROPERTY_UID);
    expect(rows[0].content.length).toBeGreaterThan(100);
    expect(rows[0].content).toContain('Advani');
  });

  it('tool_registry for guest-messaging archetype includes /tools/knowledge_base/search.ts', async () => {
    const prisma = getPrisma();
    const rows = await prisma.$queryRaw<{ tool_registry: unknown }[]>`
      SELECT tool_registry FROM archetypes
      WHERE role_name = 'guest-messaging' AND tenant_id = ${VLRE_TENANT_ID}::uuid
    `;
    expect(rows).toHaveLength(1);
    const registry = rows[0].tool_registry as { tools: string[] };
    expect(Array.isArray(registry.tools)).toBe(true);
    expect(registry.tools).toContain('/tools/knowledge_base/search.ts');
  });

  it('no KB rows exist for DozalDevs tenant (tenant isolation)', async () => {
    const prisma = getPrisma();
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint FROM knowledge_base_entries
      WHERE tenant_id = ${DOZALDEVS_TENANT_ID}::uuid
    `;
    expect(Number(rows[0].count)).toBe(0);
  });

  it('deterministic UUIDs match expected values for original KB rows', async () => {
    const prisma = getPrisma();
    const rows = await prisma.$queryRaw<{ id: string; scope: string }[]>`
      SELECT id, scope FROM knowledge_base_entries
      WHERE tenant_id = ${VLRE_TENANT_ID}::uuid
      ORDER BY scope
    `;
    expect(rows).toHaveLength(10);
    const commonRow = rows.find((r) => r.scope === 'common');
    const entityRows = rows.filter((r) => r.scope === 'entity');
    expect(commonRow?.id).toBe(COMMON_KB_ID);
    expect(entityRows.some((r) => r.id === ENTITY_KB_ID)).toBe(true);
  });

  it('3412-san property KB has correct entity_id and content', async () => {
    const prisma = getPrisma();
    const rows = await prisma.$queryRaw<
      { scope: string; entity_type: string; entity_id: string; content: string }[]
    >`
      SELECT scope, entity_type, entity_id, content FROM knowledge_base_entries
      WHERE id = '00000000-0000-0000-0000-000000000104'::uuid
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('entity');
    expect(rows[0].entity_type).toBe('property');
    expect(rows[0].entity_id).toBe('4d23f49c-84e1-4a55-bfd4-3a5dec15e7b9');
    expect(rows[0].content.length).toBeGreaterThan(100);
    expect(rows[0].content).toContain('3412');
  });

  it('219-pau property KB has correct entity_id and content', async () => {
    const prisma = getPrisma();
    const rows = await prisma.$queryRaw<
      { scope: string; entity_type: string; entity_id: string; content: string }[]
    >`
      SELECT scope, entity_type, entity_id, content FROM knowledge_base_entries
      WHERE id = '00000000-0000-0000-0000-000000000108'::uuid
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('entity');
    expect(rows[0].entity_type).toBe('property');
    expect(rows[0].entity_id).toBe('3fa27670-f4f6-443b-a412-6078d4f5517e');
    expect(rows[0].content.length).toBeGreaterThan(100);
    expect(rows[0].content).toContain('219');
  });

  it('1602-blu property KB has correct entity_id and content', async () => {
    const prisma = getPrisma();
    const rows = await prisma.$queryRaw<
      { scope: string; entity_type: string; entity_id: string; content: string }[]
    >`
      SELECT scope, entity_type, entity_id, content FROM knowledge_base_entries
      WHERE id = '00000000-0000-0000-0000-000000000109'::uuid
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('entity');
    expect(rows[0].entity_type).toBe('property');
    expect(rows[0].entity_id).toBe('dac5a0e0-3984-4f72-b622-de45a9dd758f');
    expect(rows[0].content.length).toBeGreaterThan(100);
    expect(rows[0].content).toContain('1602');
  });
});
