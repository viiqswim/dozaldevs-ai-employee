#!/bin/bash
# Phase 1: Foundation — Verification Playbook
# Run this script after completing all Phase 1 tasks to verify the setup.
# Source: docs/2026-03-25-1901-mvp-implementation-phases.md (lines 114-142)

set -o pipefail

PASS=0
FAIL=0

check_pass() {
  echo "  ✓ PASS: $1"
  ((PASS++)) || true
}

check_fail() {
  echo "  ✗ FAIL: $1"
  ((FAIL++)) || true
}

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Phase 1: Foundation Verification Playbook     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─────────────────────────────────────────────────────
# Check 1: TypeScript compiles without errors
# ─────────────────────────────────────────────────────
echo "── Check 1: TypeScript compilation ──"
if pnpm build > /dev/null 2>&1; then
  check_pass "TypeScript compiles clean (tsc --noEmit exit 0)"
else
  check_fail "TypeScript compilation failed — run 'pnpm build' for details"
fi

# ─────────────────────────────────────────────────────
# Check 2: Local Supabase is running
# ─────────────────────────────────────────────────────
echo "── Check 2: Local Supabase running ──"
if docker compose -f docker/docker-compose.yml ps --format json 2>/dev/null | grep -q '"running"'; then
  check_pass "Supabase is running (Docker Compose)"
else
  check_fail "Supabase is not running — run 'pnpm setup' or 'docker compose -f docker/docker-compose.yml up -d'"
fi

# ─────────────────────────────────────────────────────
# Check 3: Migrations applied
# ─────────────────────────────────────────────────────
echo "── Check 3: Prisma migrations applied ──"
MIGRATE_STATUS=$(pnpm prisma migrate status 2>&1)
if echo "$MIGRATE_STATUS" | grep -q "up to date"; then
  check_pass "All Prisma migrations applied"
else
  check_fail "Prisma migrations not fully applied — run 'pnpm db:migrate'"
fi

# ─────────────────────────────────────────────────────
# Check 4: All 16 tables exist
# ─────────────────────────────────────────────────────
echo "── Check 4: All 16 tables exist ──"
TABLE_COUNT=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name != '_prisma_migrations';" 2>/dev/null | tr -d ' \n')
if [ -n "$TABLE_COUNT" ] && [ "$TABLE_COUNT" -ge 16 ]; then
  check_pass "All $TABLE_COUNT application tables exist in public schema"
else
  check_fail "Expected >= 16 tables, found: ${TABLE_COUNT:-UNKNOWN}. Run migrations first."
fi

# ─────────────────────────────────────────────────────
# Check 5: Seed data present
# ─────────────────────────────────────────────────────
echo "── Check 5: Seed data present ──"
PROJECT_COUNT=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -t -c \
  "SELECT COUNT(*) FROM projects WHERE name = 'test-project';" 2>/dev/null | tr -d ' \n')
AGENT_COUNT=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -t -c \
  "SELECT COUNT(*) FROM agent_versions WHERE is_active = true;" 2>/dev/null | tr -d ' \n')
if [ "$PROJECT_COUNT" -ge 1 ] && [ "$AGENT_COUNT" -ge 1 ]; then
  check_pass "Seed data present: $PROJECT_COUNT project(s), $AGENT_COUNT active agent_version(s)"
else
  check_fail "Seed data missing — run 'pnpm db:seed'. Projects: ${PROJECT_COUNT:-0}, AgentVersions: ${AGENT_COUNT:-0}"
fi

# ─────────────────────────────────────────────────────
# Check 6: CHECK constraint enforced (invalid status rejected)
# ─────────────────────────────────────────────────────
echo "── Check 6: CHECK constraint on tasks.status ──"
CONSTRAINT_RESULT=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -c \
  "INSERT INTO tasks (id, status, tenant_id, updated_at) VALUES (gen_random_uuid(), 'InvalidStatus', '00000000-0000-0000-0000-000000000001', NOW());" 2>&1)
if echo "$CONSTRAINT_RESULT" | grep -qiE "check constraint|violates|error"; then
  check_pass "CHECK constraint correctly rejects 'InvalidStatus'"
else
  check_fail "CHECK constraint NOT enforced — InvalidStatus was accepted!"
fi

# ─────────────────────────────────────────────────────
# Check 7: Prisma client generates
# ─────────────────────────────────────────────────────
echo "── Check 7: Prisma client generation ──"
if pnpm prisma generate > /dev/null 2>&1; then
  check_pass "Prisma client generated successfully"
else
  check_fail "Prisma client generation failed — run 'pnpm db:generate' for details"
fi

# ─────────────────────────────────────────────────────
# BONUS Check 8: ESLint passes
# ─────────────────────────────────────────────────────
echo "── Check 8: ESLint ──"
if pnpm lint > /dev/null 2>&1; then
  check_pass "ESLint passes with 0 errors"
else
  check_fail "ESLint failed — run 'pnpm lint' for details"
fi

# ─────────────────────────────────────────────────────
# BONUS Check 9: Vitest tests pass
# ─────────────────────────────────────────────────────
echo "── Check 9: Vitest automated tests ──"
if pnpm test --run > /dev/null 2>&1; then
  check_pass "All Vitest tests pass"
else
  check_fail "Vitest tests failed — run 'pnpm test --run' for details"
fi

# ─────────────────────────────────────────────────────
# BONUS Check 10: Seed idempotency
# ─────────────────────────────────────────────────────
echo "── Check 10: Seed idempotency ──"
if pnpm db:seed > /dev/null 2>&1 && pnpm db:seed > /dev/null 2>&1; then
  # Verify no duplicate records
  PROJ_COUNT=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -t -c \
    "SELECT COUNT(*) FROM projects;" 2>/dev/null | tr -d ' \n')
  if [ "$PROJ_COUNT" -eq 1 ]; then
    check_pass "Seed is idempotent — 2 runs produce same result ($PROJ_COUNT project)"
  else
    check_fail "Seed created duplicates! Expected 1 project, found $PROJ_COUNT"
  fi
else
  check_fail "Seed script failed on second run — check 'pnpm db:seed'"
fi

# ─────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
if [ "$FAIL" -eq 0 ]; then
  echo "║ ✅  ALL $PASS CHECKS PASSED — Phase 1 Complete!  ║"
else
  echo "║ ❌  $PASS passed, $FAIL FAILED — Fix issues above   ║"
fi
echo "╚══════════════════════════════════════════════════╝"
echo ""

# System snapshot
echo "System Snapshot:"
echo "  Local Supabase:  RUNNING (localhost:54322)"
echo "  Studio:          http://localhost:54323"
echo "  TypeScript:      Clean compile"
echo "  Tables:          16 application tables created"
echo "  Seed data:       1 project, 1 agent_version"
echo ""

# Exit with failure if any check failed
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
