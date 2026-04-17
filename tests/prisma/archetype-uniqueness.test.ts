import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { getPrisma, disconnectPrisma } from '../setup.js';

// Use unique UUIDs per test run to avoid conflicts with other tests that delete tenants
const TENANT_A = '00000000-0000-0000-0000-aaaaaaaaaaaa';
const TENANT_B = '00000000-0000-0000-0000-bbbbbbbbbbbb';

// Use a unique suffix per test run to avoid conflicts with leftover data
const RUN_ID = Date.now().toString(36);

const createdIds: string[] = [];

beforeAll(async () => {
  const prisma = getPrisma();
  await prisma.tenant.upsert({
    where: { id: TENANT_A },
    create: {
      id: TENANT_A,
      name: 'ArchetypeTest-A',
      slug: `archetype-test-a-${RUN_ID}`,
      status: 'active',
    },
    update: {},
  });
  await prisma.tenant.upsert({
    where: { id: TENANT_B },
    create: {
      id: TENANT_B,
      name: 'ArchetypeTest-B',
      slug: `archetype-test-b-${RUN_ID}`,
      status: 'active',
    },
    update: {},
  });
});

afterEach(async () => {
  const prisma = getPrisma();
  if (createdIds.length > 0) {
    await prisma.archetype.deleteMany({ where: { id: { in: createdIds } } });
    createdIds.length = 0;
  }
});

afterAll(async () => {
  const prisma = getPrisma();
  await prisma.archetype.deleteMany({ where: { tenant_id: { in: [TENANT_A, TENANT_B] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
  await disconnectPrisma();
});

describe('Archetype unique constraint (tenant_id, role_name)', () => {
  it('inserting duplicate (tenant_id, role_name) throws P2002', async () => {
    const prisma = getPrisma();

    const first = await prisma.archetype.create({
      data: {
        role_name: `test-role-unique-${RUN_ID}`,
        tenant_id: TENANT_A,
        runtime: 'generic-harness',
      },
    });
    createdIds.push(first.id);

    await expect(
      prisma.archetype.create({
        data: {
          role_name: `test-role-unique-${RUN_ID}`,
          tenant_id: TENANT_A,
          runtime: 'generic-harness',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('same role_name with different tenant_id succeeds', async () => {
    const prisma = getPrisma();

    const first = await prisma.archetype.create({
      data: {
        role_name: `shared-role-${RUN_ID}`,
        tenant_id: TENANT_A,
        runtime: 'generic-harness',
      },
    });
    createdIds.push(first.id);

    const second = await prisma.archetype.create({
      data: {
        role_name: `shared-role-${RUN_ID}`,
        tenant_id: TENANT_B,
        runtime: 'generic-harness',
      },
    });
    createdIds.push(second.id);

    expect(second.id).toBeTruthy();
    expect(second.role_name).toBe(`shared-role-${RUN_ID}`);
    expect(second.tenant_id).toBe(TENANT_B);
  });

  it('findUnique by tenant_id_role_name compound key works', async () => {
    const prisma = getPrisma();

    const created = await prisma.archetype.create({
      data: {
        role_name: `findunique-${RUN_ID}`,
        tenant_id: TENANT_A,
        runtime: 'generic-harness',
      },
    });
    createdIds.push(created.id);

    const found = await prisma.archetype.findUnique({
      where: {
        tenant_id_role_name: {
          tenant_id: TENANT_A,
          role_name: `findunique-${RUN_ID}`,
        },
      },
    });

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });
});
