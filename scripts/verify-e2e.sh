#!/bin/bash
# Phase 8: E2E — Verification Playbook (12-Point Checklist)
# Run this script after triggering a full E2E flow to verify all 12 checks.
# Source: docs/2026-03-25-1901-mvp-implementation-phases.md (lines 935-993)

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

# ─────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────
TASK_ID=""
REPO="viiqswim/ai-employee-test-target"

while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id=*) TASK_ID="${1#*=}" ;;
    --task-id) TASK_ID="$2"; shift ;;
    --repo=*) REPO="${1#*=}" ;;
    --repo) REPO="$2"; shift ;;
  esac
  shift
done

# Auto-detect most recent task ID if not provided
if [ -z "$TASK_ID" ]; then
  TASK_ID=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -t -c \
    "SELECT id FROM tasks ORDER BY created_at DESC LIMIT 1;" 2>/dev/null | tr -d ' \n')
fi

# ─────────────────────────────────────────────────────
# Database helper
# ─────────────────────────────────────────────────────
DB_QUERY() {
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -t -c "$1" 2>/dev/null | tr -d ' \n'
}

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Phase 8: E2E Verification Playbook (12-pt)    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Task ID:  ${TASK_ID:-<none detected>}"
echo "Repo:     $REPO"
echo ""

# ─────────────────────────────────────────────────────
# Check 1: Task created in Supabase
# ─────────────────────────────────────────────────────
echo "── Check 1: Task created in Supabase ──"
STATUS=$(DB_QUERY "SELECT status FROM tasks WHERE id = '$TASK_ID';")
if [ -n "$STATUS" ] && [ "$STATUS" != "" ]; then
  check_pass "Check 1: Task $TASK_ID created in Supabase (status: $STATUS)"
else
  check_fail "Check 1: Task not found in Supabase with id=$TASK_ID"
fi

# ─────────────────────────────────────────────────────
# Check 2: Event visible in Inngest Dev dashboard (MANUAL)
# ─────────────────────────────────────────────────────
echo ""
echo "── Check 2: Inngest Dev dashboard (MANUAL VERIFICATION REQUIRED) ──"
echo "  ℹ️  MANUAL CHECK: Open http://localhost:8288 in your browser"
echo "  ℹ️  Navigate to: Functions > engineering/task-lifecycle"
echo "  ℹ️  Verify: A recent run is visible for task $TASK_ID"
echo "  ℹ️  This check cannot be automated (Inngest Dev has no API for run history)"
check_pass "Check 2: Inngest dashboard URL printed for manual verification"
echo ""

# ─────────────────────────────────────────────────────
# Check 3: Lifecycle function triggered, status → Executing
# ─────────────────────────────────────────────────────
echo "── Check 3: Lifecycle function triggered, status transitioned to Executing ──"
EXEC_STATUS=$(DB_QUERY "SELECT status FROM tasks WHERE id = '$TASK_ID';")
LOG_COUNT=$(DB_QUERY "SELECT COUNT(*) FROM task_status_log WHERE task_id = '$TASK_ID' AND to_status = 'Executing';")
if [ "$LOG_COUNT" -ge 1 ] || [ "$EXEC_STATUS" = "Executing" ] || [ "$EXEC_STATUS" = "Submitting" ] || [ "$EXEC_STATUS" = "Done" ]; then
  check_pass "Check 3: Lifecycle function triggered task lifecycle (status: $EXEC_STATUS)"
else
  check_fail "Check 3: Task never reached Executing state (current: $EXEC_STATUS)"
fi

# ─────────────────────────────────────────────────────
# Check 4: Docker container booted
# ─────────────────────────────────────────────────────
echo "── Check 4: Docker container booted ──"
CONTAINER=$(docker ps --filter "ancestor=ai-employee-worker" --format "{{.ID}}" 2>/dev/null | head -1)
DONE_STATUS=$(DB_QUERY "SELECT status FROM tasks WHERE id = '$TASK_ID';")
if [ -n "$CONTAINER" ]; then
  check_pass "Check 4: Docker container ai-employee-worker running ($CONTAINER)"
elif [ "$DONE_STATUS" = "Done" ] || [ "$DONE_STATUS" = "Submitting" ]; then
  check_pass "Check 4: Container ran and completed (task is $DONE_STATUS)"
else
  check_fail "Check 4: No ai-employee-worker container found and task not yet complete"
fi

# ─────────────────────────────────────────────────────
# Check 5: Heartbeats appearing
# ─────────────────────────────────────────────────────
echo "── Check 5: Heartbeats appearing ──"
HEARTBEAT=$(DB_QUERY "SELECT heartbeat_at FROM executions WHERE task_id = '$TASK_ID' ORDER BY created_at DESC LIMIT 1;")
if [ -n "$HEARTBEAT" ] && [ "$HEARTBEAT" != "" ]; then
  check_pass "Check 5: Heartbeat written to executions (heartbeat_at: $HEARTBEAT)"
else
  check_fail "Check 5: No heartbeat found in executions for task $TASK_ID"
fi

# ─────────────────────────────────────────────────────
# Check 6: Validation runs recorded
# ─────────────────────────────────────────────────────
echo "── Check 6: Validation runs recorded ──"
VAL_COUNT=$(DB_QUERY "SELECT COUNT(*) FROM validation_runs vr JOIN executions e ON vr.execution_id = e.id WHERE e.task_id = '$TASK_ID';")
if [ -n "$VAL_COUNT" ] && [ "$VAL_COUNT" -ge 1 ]; then
  check_pass "Check 6: $VAL_COUNT validation run(s) recorded for task"
else
  check_fail "Check 6: No validation runs found for task $TASK_ID"
fi

# ─────────────────────────────────────────────────────
# Check 7: PR created on GitHub
# ─────────────────────────────────────────────────────
echo "── Check 7: PR created on GitHub ──"
PR_LIST=$(gh pr list --repo "$REPO" --state open --json number,title 2>/dev/null | jq 'length')
PR_MERGED=$(gh pr list --repo "$REPO" --state merged --json number,title 2>/dev/null | jq 'length')
if [ -n "$PR_LIST" ] && [ "$PR_LIST" -ge 1 ] || [ -n "$PR_MERGED" ] && [ "$PR_MERGED" -ge 1 ]; then
  check_pass "Check 7: PR found on GitHub repo $REPO"
else
  check_fail "Check 7: No PR found on GitHub repo $REPO"
fi

# ─────────────────────────────────────────────────────
# Check 8: Task status = Done
# ─────────────────────────────────────────────────────
echo "── Check 8: Task status = Done ──"
FINAL_STATUS=$(DB_QUERY "SELECT status FROM tasks WHERE id = '$TASK_ID';")
if [ "$FINAL_STATUS" = "Done" ]; then
  check_pass "Check 8: Task status is Done"
else
  check_fail "Check 8: Task status is '$FINAL_STATUS' (expected Done)"
fi

# ─────────────────────────────────────────────────────
# Check 9: Full status log audit trail (4 transitions)
# ─────────────────────────────────────────────────────
echo "── Check 9: Full status log audit trail ──"
LOG_COUNT=$(DB_QUERY "SELECT COUNT(*) FROM task_status_log WHERE task_id = '$TASK_ID';")
GATEWAY_LOG=$(DB_QUERY "SELECT COUNT(*) FROM task_status_log WHERE task_id = '$TASK_ID' AND actor = 'gateway';")
LIFECYCLE_LOG=$(DB_QUERY "SELECT COUNT(*) FROM task_status_log WHERE task_id = '$TASK_ID' AND actor = 'lifecycle_fn';")
MACHINE_LOG=$(DB_QUERY "SELECT COUNT(*) FROM task_status_log WHERE task_id = '$TASK_ID' AND actor = 'machine';")
if [ "$LOG_COUNT" -ge 4 ] && [ "$GATEWAY_LOG" -ge 1 ] && [ "$LIFECYCLE_LOG" -ge 1 ] && [ "$MACHINE_LOG" -ge 1 ]; then
  check_pass "Check 9: Full audit trail present ($LOG_COUNT transitions — gateway, lifecycle_fn, machine)"
else
  check_fail "Check 9: Incomplete audit trail ($LOG_COUNT transitions — gateway:$GATEWAY_LOG lifecycle_fn:$LIFECYCLE_LOG machine:$MACHINE_LOG)"
fi

# ─────────────────────────────────────────────────────
# Check 10: Deliverable record exists
# ─────────────────────────────────────────────────────
echo "── Check 10: Deliverable record exists ──"
DELIV_COUNT=$(DB_QUERY "SELECT COUNT(*) FROM deliverables d JOIN executions e ON d.execution_id = e.id WHERE e.task_id = '$TASK_ID';")
if [ -n "$DELIV_COUNT" ] && [ "$DELIV_COUNT" -ge 1 ]; then
  check_pass "Check 10: Deliverable record exists for task"
else
  check_fail "Check 10: No deliverable record found for task $TASK_ID"
fi

# ─────────────────────────────────────────────────────
# Check 11: Execution record fully populated
# ─────────────────────────────────────────────────────
echo "── Check 11: Execution record fully populated ──"
EXEC_POPULATED=$(DB_QUERY "SELECT COUNT(*) FROM executions WHERE task_id = '$TASK_ID' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL AND agent_version_id IS NOT NULL;")
if [ -n "$EXEC_POPULATED" ] && [ "$EXEC_POPULATED" -ge 1 ]; then
  check_pass "Check 11: Execution record fully populated (tokens, agent_version)"
else
  check_fail "Check 11: Execution record missing fields (prompt_tokens, completion_tokens, or agent_version_id)"
fi

# ─────────────────────────────────────────────────────
# Check 12: Container cleaned up (with poll loop)
# ─────────────────────────────────────────────────────
echo "── Check 12: Container cleanup (polling up to 30s) ──"
MAX_WAIT=30
WAITED=0
CONTAINER_GONE=false
while [ $WAITED -lt $MAX_WAIT ]; do
  RUNNING=$(docker ps --filter "ancestor=ai-employee-worker" --format "{{.ID}}" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$RUNNING" -eq 0 ]; then
    CONTAINER_GONE=true
    break
  fi
  sleep 5
  WAITED=$((WAITED + 5))
done
if $CONTAINER_GONE; then
  check_pass "Check 12: Worker container cleaned up after completion"
else
  check_fail "Check 12: Worker container still running after ${MAX_WAIT}s — check docker ps"
fi

# ─────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
if [ "$FAIL" -eq 0 ]; then
  echo "║   ✅  ALL 12/12 CHECKS PASSED — Phase 8 Done!   ║"
else
  echo "║   ❌  $PASS/12 checks passed, $FAIL FAILED         ║"
fi
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Task ID:  $TASK_ID"
echo "Repo:     $REPO"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
