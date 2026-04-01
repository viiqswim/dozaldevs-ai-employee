#!/bin/bash
# dev-start.sh — Launch all local E2E services in order with health checks
# Usage: ./scripts/dev-start.sh [--reset]
# Source: docs/2026-03-25-1901-mvp-implementation-phases.md (lines 892-914)

set -o pipefail

INNGEST_PID=""
GATEWAY_PID=""
RESET=false

# ─────────────────────────────────────────────────────
# Parse flags
# ─────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --reset)
      RESET=true
      ;;
    *)
      echo "Unknown flag: $arg"
      echo "Usage: $0 [--reset]"
      exit 1
      ;;
  esac
done

# ─────────────────────────────────────────────────────
# Cleanup trap
# ─────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Shutting down services..."
  kill $INNGEST_PID $GATEWAY_PID 2>/dev/null || true
  wait $INNGEST_PID $GATEWAY_PID 2>/dev/null || true
  echo "Shutdown complete."
  exit 0
}
trap cleanup SIGINT SIGTERM

# ─────────────────────────────────────────────────────
# Load .env if it exists
# ─────────────────────────────────────────────────────
if [ -f .env ]; then
  # shellcheck source=/dev/null
  source .env
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║     Local E2E Dev Environment — Starting        ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─────────────────────────────────────────────────────
# Step 1: Prerequisites check
# ─────────────────────────────────────────────────────
echo "── Step 1: Prerequisites check ──"

PREREQ_FAIL=0

if docker info > /dev/null 2>&1; then
  echo "  ✓ Docker daemon is running"
else
  echo "  ✗ Docker daemon is not running — start Docker Desktop first"
  PREREQ_FAIL=1
fi

if command -v supabase > /dev/null 2>&1; then
  echo "  ✓ Supabase CLI available"
else
  echo "  ✗ Supabase CLI not found — install via: brew install supabase/tap/supabase"
  PREREQ_FAIL=1
fi

REQUIRED_VARS=(
  "DATABASE_URL"
  "SUPABASE_URL"
  "SUPABASE_SECRET_KEY"
  "JIRA_WEBHOOK_SECRET"
  "INNGEST_EVENT_KEY"
  "INNGEST_SIGNING_KEY"
  "OPENROUTER_API_KEY"
  "GITHUB_TOKEN"
)

for var in "${REQUIRED_VARS[@]}"; do
  if [ -n "${!var}" ]; then
    echo "  ✓ $var is set"
  else
    echo "  ✗ $var is not set — add it to .env"
    PREREQ_FAIL=1
  fi
done

if [ "$PREREQ_FAIL" -ne 0 ]; then
  echo ""
  echo "  Prerequisites failed. Fix issues above and re-run."
  exit 1
fi

echo ""

# ─────────────────────────────────────────────────────
# Step 2: DB Reset (only when --reset flag passed)
# ─────────────────────────────────────────────────────
if [ "$RESET" = true ]; then
  echo "── Step 2: Resetting DB tables (--reset flag) ──"
  TABLES=("task_status_log" "validation_runs" "deliverables" "executions" "tasks")
  for table in "${TABLES[@]}"; do
    if PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
        -c "DELETE FROM $table;" > /dev/null 2>&1; then
      echo "  ✓ Cleared: $table"
    else
      echo "  ✗ Could not clear $table (Supabase may not be running yet — will skip)"
    fi
  done
  echo ""
fi

# ─────────────────────────────────────────────────────
# Step 3: Start Supabase (skip if already running)
# ─────────────────────────────────────────────────────
echo "── Step 3: Starting Supabase ──"

if supabase status > /dev/null 2>&1; then
  echo "  ✓ Supabase already running — skipping start"
else
  echo "  Starting Supabase (this may take a moment)..."
  if supabase start; then
    echo "  ✓ Supabase started"
  else
    echo "  ✗ Failed to start Supabase"
    exit 1
  fi
fi

# Run migrations (non-blocking — may fail if DB schema is already up-to-date)
echo "  Running Prisma migrations..."
pnpm prisma migrate dev --skip-generate > /dev/null 2>&1 || true
echo "  ✓ Migrations complete (or already up-to-date)"
echo ""

# ─────────────────────────────────────────────────────
# Step 4: Wait for Supabase health
# ─────────────────────────────────────────────────────
echo "── Step 4: Waiting for Supabase health (up to 60s) ──"
SUPABASE_TIMEOUT=60
SUPABASE_ELAPSED=0
until curl -sf http://localhost:54321/health > /dev/null 2>&1; do
  if [ "$SUPABASE_ELAPSED" -ge "$SUPABASE_TIMEOUT" ]; then
    echo "  ✗ Supabase did not become healthy after ${SUPABASE_TIMEOUT}s"
    exit 1
  fi
  sleep 2
  SUPABASE_ELAPSED=$((SUPABASE_ELAPSED + 2))
  echo "  ... waiting (${SUPABASE_ELAPSED}s)"
done
echo "  ✓ Supabase is healthy at http://localhost:54321"
echo ""

# ─────────────────────────────────────────────────────
# Step 5: Start Inngest Dev Server
# ─────────────────────────────────────────────────────
echo "── Step 5: Starting Inngest Dev Server ──"
npx inngest-cli@latest dev > /tmp/inngest-dev.log 2>&1 &
INNGEST_PID=$!
echo "  Inngest Dev Server started (PID: $INNGEST_PID)"
echo ""

# ─────────────────────────────────────────────────────
# Step 6: Wait for Inngest health
# ─────────────────────────────────────────────────────
echo "── Step 6: Waiting for Inngest health (up to 30s) ──"
INNGEST_TIMEOUT=30
INNGEST_ELAPSED=0
until curl -sf http://localhost:8288/ > /dev/null 2>&1; do
  if [ "$INNGEST_ELAPSED" -ge "$INNGEST_TIMEOUT" ]; then
    echo "  ✗ Inngest Dev Server did not become healthy after ${INNGEST_TIMEOUT}s"
    echo "  Check logs: tail /tmp/inngest-dev.log"
    cleanup
    exit 1
  fi
  sleep 2
  INNGEST_ELAPSED=$((INNGEST_ELAPSED + 2))
  echo "  ... waiting (${INNGEST_ELAPSED}s)"
done
echo "  ✓ Inngest Dev Server is healthy at http://localhost:8288"
echo ""

# ─────────────────────────────────────────────────────
# Step 7: Start Event Gateway
# ─────────────────────────────────────────────────────
echo "── Step 7: Starting Event Gateway ──"
pnpm dev > /tmp/gateway.log 2>&1 &
GATEWAY_PID=$!
echo "  Event Gateway started (PID: $GATEWAY_PID)"
echo ""

# ─────────────────────────────────────────────────────
# Step 8: Wait for Gateway health
# ─────────────────────────────────────────────────────
echo "── Step 8: Waiting for Gateway health (up to 30s) ──"
GATEWAY_TIMEOUT=30
GATEWAY_ELAPSED=0
until curl -sf http://localhost:3000/health > /dev/null 2>&1; do
  if [ "$GATEWAY_ELAPSED" -ge "$GATEWAY_TIMEOUT" ]; then
    echo "  ✗ Event Gateway did not become healthy after ${GATEWAY_TIMEOUT}s"
    echo "  Check logs: tail /tmp/gateway.log"
    cleanup
    exit 1
  fi
  sleep 2
  GATEWAY_ELAPSED=$((GATEWAY_ELAPSED + 2))
  echo "  ... waiting (${GATEWAY_ELAPSED}s)"
done
echo "  ✓ Event Gateway is healthy at http://localhost:3000"
echo ""

# ─────────────────────────────────────────────────────
# Summary banner
# ─────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════╗"
echo "║          Local E2E Environment Ready            ║"
echo "╚══════════════════════════════════════════════════╝"
echo "  Supabase:   http://localhost:54321"
echo "  Studio:     http://localhost:54323"
echo "  Inngest:    http://localhost:8288"
echo "  Gateway:    http://localhost:3000"
echo ""
echo "  Press Ctrl+C to stop all services."
echo ""

# Block until Ctrl+C
wait
