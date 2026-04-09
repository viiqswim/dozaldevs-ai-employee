#!/usr/bin/env bash
# AI Employee Worker — Fly.io Machine Boot Script
# 7-step idempotent boot sequence. Uses flag files to skip completed steps on restart.
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

# =============================================================================
# RESOURCE CAPS — Keep in sync with src/workers/lib/resource-caps.ts
# =============================================================================
export TURBO_CONCURRENCY="${TURBO_CONCURRENCY:-2}"
export NEXUS_VITEST_MAX_WORKERS="${NEXUS_VITEST_MAX_WORKERS:-2}"
export OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS="${OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS:-1200000}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
BOOT_START_NS=$(date +%s%N)
log "Resource caps applied: TURBO_CONCURRENCY=${TURBO_CONCURRENCY} NEXUS_VITEST_MAX_WORKERS=${NEXUS_VITEST_MAX_WORKERS}"

step_start() {
  STEP_NAME="$1"
  STEP_START_NS=$(date +%s%N)
  log "▶ STEP: ${STEP_NAME}"
}

step_end() {
  local step_end_ns
  step_end_ns=$(date +%s%N)
  local elapsed_ms=$(( (step_end_ns - STEP_START_NS) / 1000000 ))
  local total_ms=$(( (step_end_ns - BOOT_START_NS) / 1000000 ))
  log "TIMING: ${STEP_NAME} completed in ${elapsed_ms}ms (total: ${total_ms}ms)"
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
# DISK PRE-CHECK — Skip cache if insufficient disk space
# =============================================================================
DISK_CHECK_START_NS=$(date +%s%N)
if node /app/dist/workers/lib/disk-check.js /workspace 2147483648 2>/dev/null | grep -q '"ok":true'; then
  log "Disk space check passed [OK]"
else
  log "Insufficient disk space — setting SKIP_CACHE=1 [WARN]"
  export SKIP_CACHE=1
fi
DISK_CHECK_END_NS=$(date +%s%N)
log "TIMING: disk_check completed in $(( (DISK_CHECK_END_NS - DISK_CHECK_START_NS) / 1000000 ))ms (total: $(( (DISK_CHECK_END_NS - BOOT_START_NS) / 1000000 ))ms)"

# =============================================================================
# STEP 1: Auth tokens
# =============================================================================
if ! step_done 1; then
  step_start "auth"
  log "[STEP 1/7] Writing auth tokens..."
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
  log "[STEP 1/7] Auth tokens written [OK]"
  step_end
fi

# =============================================================================
# STEP 2: Shallow clone repo
# =============================================================================
if ! step_done 2; then
  step_start "clone"
  log "[STEP 2/7] Cloning repository ${REPO_URL}..."
  CLONE_START_NS=$(date +%s%N)
  # Check if workspace already has a valid git repo (cache hit)
  if [[ -z "${SKIP_CACHE:-}" ]] && [[ -d "${WORKSPACE}/.git" ]]; then
    log "[STEP 2/7] Existing workspace found — validating cache..."
    CACHE_RESULT=$(node /app/dist/workers/lib/cache-validator.js "${WORKSPACE}" "${REPO_URL}" 2>&1 || echo '{"valid":false,"reason":"cli error"}')
    if echo "${CACHE_RESULT}" | grep -q '"valid":true'; then
      log "[STEP 2/7] Cache valid — skipping clone [SKIP]"
      mark_step_done 2
      CLONE_END_NS=$(date +%s%N)
      log "TIMING: clone completed in $(( (CLONE_END_NS - CLONE_START_NS) / 1000000 ))ms (total: $(( (CLONE_END_NS - BOOT_START_NS) / 1000000 ))ms)"
      step_end
    else
      log "[STEP 2/7] Cache invalid (${CACHE_RESULT}) — falling back to fresh clone"
      rm -rf "${WORKSPACE}"
      mkdir -p "${WORKSPACE}"
    fi
  fi
  if ! step_done 2; then
    for attempt in 1 2 3; do
      if git clone --depth=2 "${REPO_URL}" "${WORKSPACE}" 2>&1; then
        break
      fi
      if [[ $attempt -eq 3 ]]; then
        log "[STEP 2/7] Clone failed after 3 attempts [FAIL]" >&2
        exit 1
      fi
      log "[STEP 2/7] Clone attempt ${attempt} failed, retrying in 5s..."
      sleep 5
    done
    mark_step_done 2
    log "[STEP 2/7] Repository cloned [OK]"
    CLONE_END_NS=$(date +%s%N)
    log "TIMING: clone completed in $(( (CLONE_END_NS - CLONE_START_NS) / 1000000 ))ms (total: $(( (CLONE_END_NS - BOOT_START_NS) / 1000000 ))ms)"
    step_end
  fi
else
  log "[STEP 2/7] Repository already cloned — skipping [SKIP]"
fi

# =============================================================================
# STEP 3: Checkout/create task branch
# =============================================================================
if ! step_done 3; then
  step_start "branch"
  log "[STEP 3/7] Setting up task branch..."
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
  log "[STEP 3/7] Task branch ready [OK]"
  step_end
fi

# =============================================================================
# STEP 3.5: Copy opencode.json config to workspace
# =============================================================================
if [[ -d "${WORKSPACE}" ]]; then
  step_start "opencode_config"
  mkdir -p "${WORKSPACE}/.opencode"
  cp /app/opencode.json "${WORKSPACE}/.opencode/opencode.json"
  log "Copied opencode.json permission override to ${WORKSPACE}/.opencode/"
  step_end
fi

# =============================================================================
# STEP 3.6: Write boulder.json context file for agent self-awareness
# =============================================================================
if [[ -d "${WORKSPACE}" ]]; then
  step_start "boulder_context"
  TICKET_KEY="${TICKET_KEY:-${TASK_ID}}"
  BRANCH_NAME="${TASK_BRANCH:-main}"
  cat > "${WORKSPACE}/boulder.json" << BOULDER_EOF
{
  "task_id": "${TASK_ID}",
  "ticket_key": "${TICKET_KEY}",
  "branch_name": "${BRANCH_NAME}",
  "repo_root": "${WORKSPACE}",
  "plan_path": ".sisyphus/plans/${TICKET_KEY}.md",
  "improvements_file": null,
  "mode": "wave_execution"
}
BOULDER_EOF
  # Ensure boulder.json is gitignored
  if [[ -f "${WORKSPACE}/.gitignore" ]]; then
    if ! grep -q "boulder.json" "${WORKSPACE}/.gitignore"; then
      echo "boulder.json" >> "${WORKSPACE}/.gitignore"
    fi
  fi
  log "Wrote boulder.json for agent self-awareness"
  step_end
fi

# =============================================================================
# STEP 3.7: Sync plan file from Supabase on restart
# =============================================================================
step_start "plan_file_sync"
if [[ -n "${TASK_ID:-}" ]]; then
  TICKET_KEY="${TICKET_KEY:-${TASK_ID}}"
  PLAN_PATH="${WORKSPACE}/.sisyphus/plans/${TICKET_KEY}.md"
  mkdir -p "$(dirname "${PLAN_PATH}")"
  SYNC_RESULT=$(node /app/dist/workers/lib/plan-sync.js load "${TASK_ID}" "${PLAN_PATH}" 2>&1 || echo '{"loaded":false}')
  if echo "${SYNC_RESULT}" | grep -q '"loaded":true'; then
    log "Loaded plan from prior run: ${SYNC_RESULT}"
  else
    log "No prior plan found — Phase 1 will generate plan"
  fi
else
  log "TASK_ID not set — skipping plan file sync [WARN]"
fi
step_end

# =============================================================================
# STEP 4: Start Docker daemon (optional)
# =============================================================================
if ! step_done 4; then
  step_start "docker"
  if [[ -n "${ENABLE_DOCKER_DAEMON:-}" ]]; then
    log "[STEP 4/7] Starting rootless Docker daemon..."
    dockerd-rootless.sh &
    DOCKER_PID=$!
    sleep 3
    if ! docker info >/dev/null 2>&1; then
      log "[STEP 4/7] Docker daemon failed to start [WARN] — continuing without Docker"
    else
      log "[STEP 4/7] Docker daemon started (PID: ${DOCKER_PID}) [OK]"
    fi
  else
    log "[STEP 4/7] ENABLE_DOCKER_DAEMON not set — skipping Docker daemon [SKIP]"
  fi
  mark_step_done 4
  step_end
fi

# =============================================================================
# STEP 5: Read task context from Supabase
# =============================================================================
if ! step_done 5; then
  step_start "task_context"
  log "[STEP 5/7] Reading task context from Supabase..."
  TASK_CONTEXT_FILE="${WORKSPACE}/.task-context.json"
  for attempt in 1 2 3; do
    HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
      -H "apikey: ${SUPABASE_SECRET_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
      -H "Content-Type: application/json" \
      "${SUPABASE_URL}/rest/v1/tasks?id=eq.${TASK_ID}&select=*") || true
    HTTP_BODY=$(echo "${HTTP_RESPONSE}" | head -n -1)
    HTTP_CODE=$(echo "${HTTP_RESPONSE}" | tail -n 1)
    if [[ "${HTTP_CODE}" == "200" ]]; then
      echo "${HTTP_BODY}" > "${TASK_CONTEXT_FILE}"
      break
    fi
    if [[ $attempt -eq 3 ]]; then
      log "[STEP 5/7] Failed to read task context (HTTP ${HTTP_CODE}) [FAIL]" >&2
      exit 1
    fi
    log "[STEP 5/7] Supabase read attempt ${attempt} failed (HTTP ${HTTP_CODE}), retrying in 5s..."
    sleep 5
  done
  mark_step_done 5
  log "[STEP 5/7] Task context saved to ${TASK_CONTEXT_FILE} [OK]"
  step_end
fi

# =============================================================================
# STEP 6: Write initial heartbeat
# =============================================================================
if ! step_done 6; then
  step_start "heartbeat"
  log "[STEP 6/7] Writing initial heartbeat to executions table..."
  HEARTBEAT_PAYLOAD="{\"task_id\": \"${TASK_ID}\", \"runtime_type\": \"opencode\", \"current_stage\": \"boot\", \"status\": \"running\", \"heartbeat_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  for attempt in 1 2 3; do
    HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
      -H "apikey: ${SUPABASE_SECRET_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=representation" \
      -d "${HEARTBEAT_PAYLOAD}" \
      "${SUPABASE_URL}/rest/v1/executions") || true
    HTTP_BODY=$(echo "${HTTP_RESPONSE}" | head -n -1)
    HTTP_CODE=$(echo "${HTTP_RESPONSE}" | tail -n 1)
    if [[ "${HTTP_CODE}" == "201" ]]; then
      EXECUTION_ID=$(echo "${HTTP_BODY}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
      echo "${EXECUTION_ID}" > "${EXECUTION_ID_FILE}"
      break
    fi
    if [[ $attempt -eq 3 ]]; then
      log "[STEP 6/7] Heartbeat write failed (HTTP ${HTTP_CODE}) — continuing [WARN]"
      break
    fi
    log "[STEP 6/7] Heartbeat attempt ${attempt} failed (HTTP ${HTTP_CODE}), retrying in 5s..."
    sleep 5
  done
  mark_step_done 6
  log "[STEP 6/7] Initial heartbeat written [OK]"
  step_end
fi

# =============================================================================
# STEP 6.5: Write OpenCode provider credentials (auth.json)
# =============================================================================
step_start "opencode_auth"
log "[STEP 6.5/7] Configuring OpenCode provider credentials..."
OPENCODE_AUTH_DIR="${HOME}/.local/share/opencode"
mkdir -p "${OPENCODE_AUTH_DIR}"
if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
  printf '{\n  "openrouter": {\n    "type": "api",\n    "key": "%s"\n  }\n}\n' "${OPENROUTER_API_KEY}" > "${OPENCODE_AUTH_DIR}/auth.json"
  log "[STEP 6.5/7] OpenRouter credentials written [OK]"
else
  log "[STEP 6.5/7] OPENROUTER_API_KEY not set — skipping credentials [WARN]"
fi
step_end

# =============================================================================
# STEP 7: Hand off to orchestrate.mjs
# =============================================================================
log "[STEP 7/7] Handing off to orchestrate.mjs..."
ORCHESTRATE_SCRIPT="/app/dist/workers/orchestrate.mjs"
if [[ -f "${ORCHESTRATE_SCRIPT}" ]]; then
  exec node "${ORCHESTRATE_SCRIPT}"
else
  log "[STEP 7/7] orchestrate.mjs not found at ${ORCHESTRATE_SCRIPT} — Phase 5 not yet built"
  log "[STEP 7/7] Handoff point reached [OK] — exiting cleanly"
  exit 0
fi
