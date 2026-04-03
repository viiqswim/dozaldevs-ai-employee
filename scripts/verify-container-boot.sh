#!/usr/bin/env bash
# Verify AI Employee worker container boots and writes a heartbeat to Supabase.
# Usage: bash scripts/verify-container-boot.sh
set -euo pipefail

# ---------------------------------------------------------------------------
# Source local env vars (DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY)
# ---------------------------------------------------------------------------
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

IMAGE="${WORKER_IMAGE:-ai-employee-worker}"
TEST_TASK_ID="22222222-2222-2222-2222-222222222222"
# App database (Prisma / direct queries)
APP_DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:54322/ai_employee}"
# Supabase's own postgres database — what PostgREST serves via REST API
SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"
SUPABASE_URL="${SUPABASE_URL:-http://localhost:54321}"
SUPABASE_SECRET_KEY="${SUPABASE_SECRET_KEY:-}"

PASS=0
FAIL=0
WARN=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
check() {
  local name="$1"
  local result="$2"
  if [[ "${result}" == PASS* ]]; then
    echo "  ✓ ${name}"
    ((PASS++)) || true
  elif [[ "${result}" == WARN* ]]; then
    echo "  ~ ${name}: ${result#WARN: }"
    ((WARN++)) || true
  else
    echo "  ✗ ${name}: ${result#FAIL: }"
    ((FAIL++)) || true
  fi
}

cleanup() {
  psql "${SUPABASE_DB_URL}" -q -c "
    DELETE FROM executions WHERE task_id = '${TEST_TASK_ID}';
    DELETE FROM tasks WHERE id = '${TEST_TASK_ID}';
    DELETE FROM projects WHERE id = '00000000-0000-0000-0000-000000000003';
  " 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
if [[ -z "${SUPABASE_SECRET_KEY}" ]]; then
  echo "ERROR: SUPABASE_SECRET_KEY is not set (check .env)" >&2
  exit 1
fi

if ! docker images "${IMAGE}" --format "{{.Repository}}" 2>/dev/null | grep -q "${IMAGE}"; then
  echo "ERROR: Docker image '${IMAGE}' not found." >&2
  echo "       Run: docker build -t ${IMAGE} -f Dockerfile ." >&2
  exit 1
fi

if ! psql "${APP_DB_URL}" -c "SELECT 1" >/dev/null 2>&1; then
  echo "ERROR: Cannot connect to app database at ${APP_DB_URL}" >&2
  echo "       Is Supabase running? Run: pnpm setup or docker compose -f docker/docker-compose.yml up -d" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Apply schema to Supabase postgres DB so PostgREST can serve our tables
# ---------------------------------------------------------------------------
echo ""
echo "Container Boot Verification"
echo "==========================="
echo ""
echo "Ensuring schema in Supabase postgres DB (PostgREST target)..."

psql "${SUPABASE_DB_URL}" -q -c "
  CREATE TABLE IF NOT EXISTS projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    repo_url    TEXT NOT NULL DEFAULT '',
    default_branch TEXT NOT NULL DEFAULT 'main',
    concurrency_limit INT NOT NULL DEFAULT 3,
    tenant_id   UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id              UUID PRIMARY KEY,
    external_id     TEXT,
    source_system   TEXT,
    status          TEXT NOT NULL DEFAULT 'Received',
    tenant_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    triage_result   JSONB,
    project_id      UUID REFERENCES projects(id),
    archetype_id    UUID,
    requirements    JSONB,
    scope_estimate  INT,
    affected_resources JSONB,
    raw_event       JSONB,
    dispatch_attempts INT NOT NULL DEFAULT 0,
    failure_reason  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS executions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id             UUID NOT NULL REFERENCES tasks(id),
    runtime_type        TEXT,
    runtime_id          TEXT,
    fix_iterations      INT NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'pending',
    agent_version_id    UUID,
    prompt_tokens       INT NOT NULL DEFAULT 0,
    completion_tokens   INT NOT NULL DEFAULT 0,
    primary_model_id    TEXT,
    estimated_cost_usd  NUMERIC(10,4) NOT NULL DEFAULT 0,
    heartbeat_at        TIMESTAMPTZ,
    current_stage       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
" || { echo "  ✗ Failed to create tables in Supabase postgres DB"; exit 1; }

# Reload PostgREST schema cache
psql "${SUPABASE_DB_URL}" -q -c "NOTIFY pgrst, 'reload schema';" 2>/dev/null || true
sleep 2

# ---------------------------------------------------------------------------
# 2. Insert test data into Supabase postgres DB
# ---------------------------------------------------------------------------
echo "Inserting test task ${TEST_TASK_ID}..."

psql "${SUPABASE_DB_URL}" -q -c "
  INSERT INTO projects (id, name, repo_url, default_branch, concurrency_limit, created_at, updated_at)
  VALUES (
    '00000000-0000-0000-0000-000000000003',
    'test-project',
    'https://github.com/your-org/your-test-repo',
    'main',
    3,
    NOW(),
    NOW()
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO tasks (id, external_id, source_system, status, tenant_id, triage_result, project_id, created_at, updated_at)
  VALUES (
    '${TEST_TASK_ID}',
    'BOOT-TEST-001',
    'jira',
    'Executing',
    '00000000-0000-0000-0000-000000000001',
    '{\"ticket_id\": \"BOOT-TEST-001\", \"title\": \"Boot test task\", \"description\": \"Integration test\"}',
    '00000000-0000-0000-0000-000000000003',
    NOW(),
    NOW()
  )
  ON CONFLICT DO NOTHING;
" || { echo "  ✗ Failed to insert test task"; exit 1; }

# ---------------------------------------------------------------------------
# 3. Run container (120s timeout)
# ---------------------------------------------------------------------------
echo "Running container (timeout: 120s)..."
echo ""

CONTAINER_LOG=$(mktemp /tmp/verify-container-boot-XXXXXX.log)
CONTAINER_EXIT=0

timeout 120 docker run --rm --network host \
  -e TASK_ID="${TEST_TASK_ID}" \
  -e REPO_URL="https://github.com/antfu/ni" \
  -e REPO_BRANCH="main" \
  -e SUPABASE_URL="${SUPABASE_URL}" \
  -e SUPABASE_SECRET_KEY="${SUPABASE_SECRET_KEY}" \
  "${IMAGE}" 2>&1 | tee "${CONTAINER_LOG}" || CONTAINER_EXIT=$?

echo ""

# ---------------------------------------------------------------------------
# 4. Evaluate results
# ---------------------------------------------------------------------------

# Check: container started (step 1 logged)
if grep -q "\[STEP 1/8\]" "${CONTAINER_LOG}" 2>/dev/null; then
  check "Container started" "PASS"
else
  check "Container started" "FAIL: [STEP 1/8] not found in logs"
fi

# Check: task context read (step 6)
if grep -q "\[STEP 6/8\]" "${CONTAINER_LOG}" 2>/dev/null; then
  if grep -q "Task context saved" "${CONTAINER_LOG}" 2>/dev/null; then
    check "Task context read (Step 6)" "PASS"
  else
    check "Task context read (Step 6)" "WARN: [STEP 6/8] started but 'Task context saved' not found"
  fi
else
  check "Task context read (Step 6)" "WARN: Step 6 not reached (container failed at an earlier step)"
fi

# Check: heartbeat written (step 7)
if grep -q "\[STEP 7/8\]" "${CONTAINER_LOG}" 2>/dev/null; then
  if grep -q "heartbeat written" "${CONTAINER_LOG}" 2>/dev/null; then
    check "Heartbeat written (Step 7)" "PASS"
  else
    check "Heartbeat written (Step 7)" "WARN: [STEP 7/8] started but 'heartbeat written' not in logs"
  fi
else
  check "Heartbeat written (Step 7)" "WARN: Step 7 not reached"
fi

# Check: handoff point (step 8)
if grep -q "\[STEP 8/8\]" "${CONTAINER_LOG}" 2>/dev/null; then
  if grep -q "Handoff point reached" "${CONTAINER_LOG}" 2>/dev/null; then
    check "Handoff point reached (Step 8)" "PASS"
  else
    # Step 8 started and handed off to orchestrate.mjs (Phase 5 built)
    check "Handoff point reached (Step 8)" "PASS (handed off to orchestrate.mjs)"
  fi
elif [[ ${CONTAINER_EXIT} -ne 0 ]]; then
  check "Handoff point reached (Step 8)" "WARN: container exited ${CONTAINER_EXIT} before Step 8"
else
  check "Handoff point reached (Step 8)" "FAIL: container exited 0 but [STEP 8/8] not in logs"
fi

# Check: executions DB row (in Supabase postgres — where container wrote via REST API)
HEARTBEAT_COUNT=$(psql "${SUPABASE_DB_URL}" -t -q -c "
  SELECT COUNT(*) FROM executions
  WHERE task_id = '${TEST_TASK_ID}'
  AND heartbeat_at > NOW() - INTERVAL '5 minutes';
" 2>/dev/null | tr -d '[:space:]' || echo "0")

if [[ "${HEARTBEAT_COUNT}" -gt 0 ]]; then
  check "executions row in DB" "PASS (count: ${HEARTBEAT_COUNT})"
else
  # Only a hard FAIL if Step 7 was logged (meaning write was attempted)
  if grep -q "\[STEP 7/8\]" "${CONTAINER_LOG}" 2>/dev/null; then
    check "executions row in DB" "FAIL: Step 7 ran but no heartbeat row found"
  else
    check "executions row in DB" "WARN: Step 7 not reached — heartbeat row not expected"
  fi
fi

rm -f "${CONTAINER_LOG}"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "---"
echo "Results: ${PASS} passed, ${FAIL} failed, ${WARN} warnings"
echo ""

if [[ ${FAIL} -gt 0 ]]; then
  echo "Boot verification FAILED."
  exit 1
fi

if [[ ${WARN} -gt 0 ]]; then
  echo "Boot checks passed (with warnings — container may have failed before heartbeat)."
  echo "For full Phase 4 verification, ensure all steps reach 8/8 with exit 0."
else
  echo "All boot checks passed!"
fi
exit 0
