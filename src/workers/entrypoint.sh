#!/usr/bin/env bash
# AI Employee Worker — Fly.io Machine Boot Script
# 8-step idempotent boot sequence. Uses flag files to skip completed steps on restart.
# Required env vars: TASK_ID, REPO_URL, SUPABASE_URL, SUPABASE_SECRET_KEY
# Optional env vars: REPO_BRANCH (default: main), ENABLE_DOCKER_DAEMON (default: unset), GITHUB_TOKEN

set -euo pipefail

WORKSPACE="/workspace"
FLAG_DIR="/tmp/.boot-flags"
EXECUTION_ID_FILE="/tmp/.execution-id"
LOG_PREFIX="[AI-WORKER]"

for required_var in TASK_ID REPO_URL SUPABASE_URL SUPABASE_SECRET_KEY; do
  if [[ -z "${!required_var:-}" ]]; then
    echo "${LOG_PREFIX} ERROR: Required env var ${required_var} is not set" >&2
    exit 1
  fi
done

REPO_BRANCH="${REPO_BRANCH:-main}"
mkdir -p "${FLAG_DIR}"

log() {
  echo "${LOG_PREFIX} $*"
}

step_done() {
  local step="$1"
  [[ -f "${FLAG_DIR}/.step-${step}-done" ]]
}

mark_step_done() {
  local step="$1"
  touch "${FLAG_DIR}/.step-${step}-done"
}

# =============================================================================
# STEP 1: Auth tokens
# =============================================================================
if ! step_done 1; then
  log "[STEP 1/8] Writing auth tokens..."
  git config --global credential.helper store
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    echo "https://x-access-token:${GITHUB_TOKEN}@github.com" > ~/.git-credentials
    echo "machine github.com login x-access-token password ${GITHUB_TOKEN}" > ~/.netrc
    chmod 600 ~/.git-credentials ~/.netrc
    echo "${GITHUB_TOKEN}" | gh auth login --with-token 2>/dev/null || true
  fi
  # Set git identity for commits (required for git commit inside container)
  git config --global user.email "ai-employee@platform.local"
  git config --global user.name "AI Employee"
  mark_step_done 1
  log "[STEP 1/8] Auth tokens written [OK]"
fi

# =============================================================================
# STEP 2: Shallow clone repo
# =============================================================================
if ! step_done 2; then
  log "[STEP 2/8] Cloning repository ${REPO_URL}..."
  for attempt in 1 2 3; do
    if git clone --depth=2 "${REPO_URL}" "${WORKSPACE}" 2>&1; then
      break
    fi
    if [[ $attempt -eq 3 ]]; then
      log "[STEP 2/8] Clone failed after 3 attempts [FAIL]" >&2
      exit 1
    fi
    log "[STEP 2/8] Clone attempt ${attempt} failed, retrying in 5s..."
    sleep 5
  done
  mark_step_done 2
  log "[STEP 2/8] Repository cloned [OK]"
else
  log "[STEP 2/8] Repository already cloned — skipping [SKIP]"
fi

# =============================================================================
# STEP 3: Checkout/create task branch
# =============================================================================
if ! step_done 3; then
  log "[STEP 3/8] Setting up task branch..."
  cd "${WORKSPACE}"
  TASK_BRANCH="${TASK_BRANCH:-}"
  if [[ -n "${TASK_BRANCH}" ]]; then
    if git show-ref --verify --quiet "refs/remotes/origin/${TASK_BRANCH}" 2>/dev/null; then
      git checkout -b "${TASK_BRANCH}" "origin/${TASK_BRANCH}"
    else
      git checkout -b "${TASK_BRANCH}"
    fi
  fi
  mark_step_done 3
  log "[STEP 3/8] Task branch ready [OK]"
fi

# =============================================================================
# STEP 4: Install dependencies
# =============================================================================
if ! step_done 4; then
  log "[STEP 4/8] Installing dependencies..."
  cd "${WORKSPACE}"
  for attempt in 1 2 3; do
    if pnpm install --frozen-lockfile 2>&1; then
      break
    fi
    if [[ $attempt -eq 3 ]]; then
      log "[STEP 4/8] pnpm install failed after 3 attempts [FAIL]" >&2
      exit 1
    fi
    log "[STEP 4/8] Install attempt ${attempt} failed, retrying in 5s..."
    sleep 5
  done
  touch "${WORKSPACE}/node_modules/.install-done"
  mark_step_done 4
  log "[STEP 4/8] Dependencies installed [OK]"
else
  log "[STEP 4/8] Dependencies already installed — skipping [SKIP]"
fi

# =============================================================================
# STEP 5: Start Docker daemon (optional)
# =============================================================================
if ! step_done 5; then
  if [[ -n "${ENABLE_DOCKER_DAEMON:-}" ]]; then
    log "[STEP 5/8] Starting rootless Docker daemon..."
    dockerd-rootless.sh &
    DOCKER_PID=$!
    sleep 3
    if ! docker info >/dev/null 2>&1; then
      log "[STEP 5/8] Docker daemon failed to start [WARN] — continuing without Docker"
    else
      log "[STEP 5/8] Docker daemon started (PID: ${DOCKER_PID}) [OK]"
    fi
  else
    log "[STEP 5/8] ENABLE_DOCKER_DAEMON not set — skipping Docker daemon [SKIP]"
  fi
  mark_step_done 5
fi

# =============================================================================
# STEP 6: Read task context from Supabase
# =============================================================================
if ! step_done 6; then
  log "[STEP 6/8] Reading task context from Supabase..."
  TASK_CONTEXT_FILE="${WORKSPACE}/.task-context.json"
  for attempt in 1 2 3; do
    HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
      -H "apikey: ${SUPABASE_SECRET_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
      -H "Content-Type: application/json" \
      "${SUPABASE_URL}/rest/v1/tasks?id=eq.${TASK_ID}&select=*")
    HTTP_BODY=$(echo "${HTTP_RESPONSE}" | head -n -1)
    HTTP_CODE=$(echo "${HTTP_RESPONSE}" | tail -n 1)
    if [[ "${HTTP_CODE}" == "200" ]]; then
      echo "${HTTP_BODY}" > "${TASK_CONTEXT_FILE}"
      break
    fi
    if [[ $attempt -eq 3 ]]; then
      log "[STEP 6/8] Failed to read task context (HTTP ${HTTP_CODE}) [FAIL]" >&2
      exit 1
    fi
    log "[STEP 6/8] Supabase read attempt ${attempt} failed (HTTP ${HTTP_CODE}), retrying in 5s..."
    sleep 5
  done
  mark_step_done 6
  log "[STEP 6/8] Task context saved to ${TASK_CONTEXT_FILE} [OK]"
fi

# =============================================================================
# STEP 7: Write initial heartbeat
# =============================================================================
if ! step_done 7; then
  log "[STEP 7/8] Writing initial heartbeat to executions table..."
  HEARTBEAT_PAYLOAD="{\"task_id\": \"${TASK_ID}\", \"runtime_type\": \"opencode\", \"current_stage\": \"boot\", \"status\": \"running\", \"heartbeat_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  for attempt in 1 2 3; do
    HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
      -H "apikey: ${SUPABASE_SECRET_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=representation" \
      -d "${HEARTBEAT_PAYLOAD}" \
      "${SUPABASE_URL}/rest/v1/executions")
    HTTP_BODY=$(echo "${HTTP_RESPONSE}" | head -n -1)
    HTTP_CODE=$(echo "${HTTP_RESPONSE}" | tail -n 1)
    if [[ "${HTTP_CODE}" == "201" ]]; then
      EXECUTION_ID=$(echo "${HTTP_BODY}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
      echo "${EXECUTION_ID}" > "${EXECUTION_ID_FILE}"
      break
    fi
    if [[ $attempt -eq 3 ]]; then
      log "[STEP 7/8] Heartbeat write failed (HTTP ${HTTP_CODE}) — continuing [WARN]"
      break
    fi
    log "[STEP 7/8] Heartbeat attempt ${attempt} failed (HTTP ${HTTP_CODE}), retrying in 5s..."
    sleep 5
  done
  mark_step_done 7
  log "[STEP 7/8] Initial heartbeat written [OK]"
fi

# =============================================================================
# STEP 8: Hand off to orchestrate.mjs
# =============================================================================
log "[STEP 8/8] Handing off to orchestrate.mjs..."
ORCHESTRATE_SCRIPT="/app/dist/workers/orchestrate.mjs"
if [[ -f "${ORCHESTRATE_SCRIPT}" ]]; then
  exec node "${ORCHESTRATE_SCRIPT}"
else
  log "[STEP 8/8] orchestrate.mjs not found at ${ORCHESTRATE_SCRIPT} — Phase 5 not yet built"
  log "[STEP 8/8] Handoff point reached [OK] — exiting cleanly"
  exit 0
fi
