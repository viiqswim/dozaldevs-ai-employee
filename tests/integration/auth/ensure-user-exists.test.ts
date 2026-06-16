import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { getPrisma, disconnectPrisma } from '../../setup.js';
import { ensureUserExists } from '../../../src/gateway/services/ensure-user-exists.js';
import type { SupabaseJwtClaims } from '../../../src/lib/auth/types.js';

const TEST_SUPABASE_ID = '11111111-1111-1111-1111-111111111101';
const TEST_EMAIL = 'ensure-user-test@example.com';

function makeTestClaims(overrides?: Partial<SupabaseJwtClaims>): SupabaseJwtClaims {
  return {
    sub: TEST_SUPABASE_ID,
    email: TEST_EMAIL,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

afterEach(async () => {
  const prisma = getPrisma();
  await prisma.user.deleteMany({ where: { supabase_id: TEST_SUPABASE_ID } });
  await prisma.user.deleteMany({
    where: { email: { startsWith: 'ensure-user-test-concurrent-' } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: 'concurrent-first-login-' } },
  });
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('ensureUserExists', () => {
  it('creates a users row on first call', async () => {
    const result = await ensureUserExists(makeTestClaims());

    expect(result.supabaseId).toBe(TEST_SUPABASE_ID);
    expect(result.email).toBe(TEST_EMAIL);
    expect(result.name).toBeNull();
    expect(result.globalRole).toBe('USER');
    expect(result.status).toBe('active');
    expect(result.id).toBeTruthy();

    const row = await getPrisma().user.findUnique({ where: { supabase_id: TEST_SUPABASE_ID } });
    expect(row).not.toBeNull();
  });

  it('returns the same user on repeated calls (idempotent)', async () => {
    const first = await ensureUserExists(makeTestClaims());
    const second = await ensureUserExists(makeTestClaims());

    expect(second.id).toBe(first.id);
    expect(second.supabaseId).toBe(first.supabaseId);

    const rows = await getPrisma().user.findMany({ where: { supabase_id: TEST_SUPABASE_ID } });
    expect(rows).toHaveLength(1);
  });

  it('does not create duplicate rows under concurrent calls', async () => {
    const supabaseId = '11111111-1111-1111-1111-111111111102';
    const email = `ensure-user-test-concurrent-${Date.now()}@example.com`;
    const claims = makeTestClaims({ sub: supabaseId, email });

    const [r1, r2, r3] = await Promise.all([
      ensureUserExists(claims),
      ensureUserExists(claims),
      ensureUserExists(claims),
    ]);

    expect(r1.id).toBe(r2.id);
    expect(r2.id).toBe(r3.id);

    const rows = await getPrisma().user.findMany({ where: { supabase_id: supabaseId } });
    expect(rows).toHaveLength(1);

    await getPrisma().user.deleteMany({ where: { supabase_id: supabaseId } });
  });

  it('does not create tenant or membership records', async () => {
    await ensureUserExists(makeTestClaims());

    const user = await getPrisma().user.findUniqueOrThrow({
      where: { supabase_id: TEST_SUPABASE_ID },
      include: { memberships: true },
    });

    expect(user.memberships).toHaveLength(0);
  });

  it('does not create duplicate rows under high-concurrency first-login (N=5)', async () => {
    // RED TEST — expected to FAIL until ensureUserExists handles P2002 (unique-constraint on email).
    // The real-world race: AuthContext calls /me and /me/tenants in parallel on first login,
    // both hit ensureUserExists simultaneously for a brand-new identity, and the plain
    // prisma.user.upsert has no P2002 retry — the second concurrent insert throws.
    const supabaseId = '11111111-1111-1111-1111-111111111103';
    const email = `concurrent-first-login-${Date.now()}@vlrealestate.co`;
    const claims = makeTestClaims({ sub: supabaseId, email });

    const results = await Promise.all([
      ensureUserExists(claims),
      ensureUserExists(claims),
      ensureUserExists(claims),
      ensureUserExists(claims),
      ensureUserExists(claims),
    ]);

    // All 5 calls must resolve (none throws)
    expect(results).toHaveLength(5);

    // All resolved results must reference the same row
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(1);

    // Exactly 1 users row must exist
    const rows = await getPrisma().user.findMany({ where: { supabase_id: supabaseId } });
    expect(rows).toHaveLength(1);

    await getPrisma().user.deleteMany({ where: { supabase_id: supabaseId } });
  });

  it('updates email on subsequent calls', async () => {
    await ensureUserExists(makeTestClaims());
    const updatedEmail = 'ensure-user-updated@example.com';
    const result = await ensureUserExists(makeTestClaims({ email: updatedEmail }));

    expect(result.email).toBe(updatedEmail);

    await getPrisma().user.deleteMany({
      where: { email: updatedEmail },
    });
  });
});
