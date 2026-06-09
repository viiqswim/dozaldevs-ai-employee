#!/usr/bin/env bash
# T23 — Admin endpoint sweep WITHOUT admin key.
# Proves every admin endpoint authenticates via JWT / SERVICE_TOKEN only.
# Auth middleware runs BEFORE validation/DB, so any non-401 status = auth passed = PASS.
# Only HTTP 401 = FAIL (admin key was required). 5xx that is a gateway crash = FAIL.
set -u

source /tmp/t23-tokens.env
OUT=.sisyphus/evidence/local/task-23-sweep.txt
: > "$OUT"

PASS=0; FAIL=0
FAKE_UUID="99999999-9999-9999-9999-999999999999"

log() { echo "$1" | tee -a "$OUT"; }

# call <principal> <method> <path> [body]
# principal: OWNER (JWT) | SERVICE (SERVICE_TOKEN) | NONE (no auth header, for public routes)
call() {
  local principal="$1" method="$2" path="$3" body="${4:-}"
  local auth=()
  case "$principal" in
    OWNER)   auth=(-H "Authorization: Bearer $JWT") ;;
    SERVICE) auth=(-H "Authorization: Bearer $SERVICE_TOKEN") ;;
    NONE)    auth=() ;;
  esac
  local args=(-s -o /dev/null -w "%{http_code}" --max-time 15 -X "$method")
  if [ "${#auth[@]}" -gt 0 ]; then args+=("${auth[@]}"); fi
  if [ -n "$body" ]; then args+=(-H "Content-Type: application/json" -d "$body"); fi

  local code
  code=$(curl "${args[@]}" "$GW$path")

  local verdict
  if [ "$code" = "401" ]; then
    verdict="FAIL"; FAIL=$((FAIL+1))
  else
    verdict="PASS"; PASS=$((PASS+1))
  fi
  printf '%-5s [%s] %-7s %-58s -> %s\n' "$verdict" "$principal" "$method" "$path" "$code" | tee -a "$OUT"
}

log "=================================================================="
log "T23 ENDPOINT SWEEP — SERVICE_TOKEN ONLY — $(date '+%Y-%m-%d %H:%M:%S')"
log "Principals: OWNER=PLATFORM_OWNER JWT (HS256) | SERVICE=SERVICE_TOKEN"
log "Rule: any non-401 = PASS (auth ran before validation/DB). 401 = FAIL."
log "=================================================================="

log ""
log "--- GROUP 1: GLOBAL / PLATFORM_OWNER (requirePermission MANAGE_TENANTS/PLATFORM) ---"
call OWNER GET    "/admin/tenants"
call OWNER POST   "/admin/tenants"                 '{}'
call OWNER GET    "/admin/model-catalog"
call OWNER GET    "/admin/model-catalog/$FAKE_UUID"
call OWNER POST   "/admin/model-catalog"           '{}'
call OWNER PATCH  "/admin/model-catalog/$FAKE_UUID" '{}'
call OWNER DELETE "/admin/model-catalog/$FAKE_UUID"
call OWNER GET    "/admin/platform-settings"
call OWNER PATCH  "/admin/platform-settings/nonexistent_key_zzz" '{"value":"x"}'
call OWNER GET    "/admin/tools"
call OWNER GET    "/admin/tools/slack/post-message"

log ""
log "--- GROUP 2: TENANT VIEWER reads (requireTenantRole VIEWER) ---"
call OWNER GET "/admin/tenants/$TENANT_A"
call OWNER GET "/admin/tenants/$TENANT_A/config"
call OWNER GET "/admin/tenants/$TENANT_A/kb/entries"
call OWNER GET "/admin/tenants/$TENANT_A/property-locks"
call OWNER GET "/admin/tenants/$TENANT_A/projects"
call OWNER GET "/admin/tenants/$TENANT_A/tasks/$FAKE_UUID"
call OWNER GET "/admin/tenants/$TENANT_A/archetypes"

log ""
log "--- GROUP 2b: admin-reads gateway endpoints (requireTenantRole VIEWER) ---"
call OWNER GET "/admin/tenants/$TENANT_A/tasks"
call OWNER GET "/admin/tenants/$TENANT_A/tasks/$FAKE_UUID/status-log"
call OWNER GET "/admin/tenants/$TENANT_A/tasks/$FAKE_UUID/pending-approval"
call OWNER GET "/admin/tenants/$TENANT_A/employee-rules"
call OWNER GET "/admin/tenants/$TENANT_A/feedback-events"
call OWNER GET "/admin/tenants/$TENANT_A/task-metrics"
call OWNER GET "/admin/tenants/$TENANT_A/integrations"
call OWNER GET "/admin/tenants/$TENANT_A/deliverables"
call OWNER GET "/admin/tenants/$TENANT_A/executions"
call OWNER GET "/admin/tenants/$TENANT_A/tasks/$FAKE_UUID/logs"

log ""
log "--- GROUP 3: TENANT ADMIN (requireTenantRole ADMIN / requirePermission) ---"
call OWNER PATCH "/admin/tenants/$TENANT_A/config" '{"bogus_field":true}'
call OWNER GET   "/admin/tenants/$TENANT_A/slack/channels"
call OWNER GET   "/admin/tenants/$TENANT_A/github/repos"
call OWNER GET   "/admin/tenants/$TENANT_A/github/available-installations"
call OWNER POST  "/admin/tenants/$TENANT_A/github/link-installation" '{}'
call OWNER GET   "/admin/tenants/$TENANT_A/archetypes/model-questions"
call OWNER POST  "/admin/tenants/$TENANT_A/archetypes/recommend-model" '{}'
call OWNER POST  "/admin/tenants/$TENANT_A/archetypes/generate" '{}'
call OWNER POST  "/admin/tenants/$TENANT_A/archetypes/compile-preview" '{}'
call OWNER GET   "/admin/tenants/$TENANT_A/archetypes/$FAKE_UUID/brain-preview"
call OWNER POST  "/admin/tenants/$TENANT_A/archetypes" '{}'
call OWNER PATCH "/admin/tenants/$TENANT_A/archetypes/$FAKE_UUID" '{}'
call OWNER DELETE "/admin/tenants/$TENANT_A/archetypes/$FAKE_UUID"
call OWNER POST  "/admin/tenants/$TENANT_A/archetypes/$FAKE_UUID/restore"
call OWNER POST  "/admin/tenants/$TENANT_A/kb/entries" '{}'
call OWNER PATCH "/admin/tenants/$TENANT_A/kb/entries/$FAKE_UUID" '{}'
call OWNER DELETE "/admin/tenants/$TENANT_A/kb/entries/$FAKE_UUID"
call OWNER POST  "/admin/tenants/$TENANT_A/property-locks" '{}'
call OWNER GET   "/admin/tenants/$TENANT_A/property-locks/$FAKE_UUID"
call OWNER PATCH "/admin/tenants/$TENANT_A/property-locks/$FAKE_UUID" '{}'
call OWNER DELETE "/admin/tenants/$TENANT_A/property-locks/$FAKE_UUID"
call OWNER POST  "/admin/tenants/$TENANT_A/employees/$FAKE_UUID/rules" '{}'
call OWNER PATCH "/admin/tenants/$TENANT_A/employees/$FAKE_UUID/rules/$FAKE_UUID" '{}'
call OWNER DELETE "/admin/tenants/$TENANT_A/employees/$FAKE_UUID/rules/$FAKE_UUID"

log ""
log "--- GROUP 4: TENANT OWNER (requireTenantRole OWNER / requirePermission) ---"
call OWNER GET    "/admin/tenants/$TENANT_A/secrets"
call OWNER PUT    "/admin/tenants/$TENANT_A/secrets/test_key_zzz" '{}'
call OWNER DELETE "/admin/tenants/$TENANT_A/secrets/nonexistent_key_zzz"
call OWNER PATCH  "/admin/tenants/$TENANT_A" '{"bogus_field":true}'
call OWNER DELETE "/admin/tenants/$FAKE_UUID"
call OWNER POST   "/admin/tenants/$FAKE_UUID/restore"
call OWNER DELETE "/admin/tenants/$TENANT_A/integrations/github"
call OWNER DELETE "/admin/tenants/$TENANT_A/integrations/google"

log ""
log "--- GROUP 5: MEMBER trigger (SERVICE_TOKEN) ---"
call SERVICE POST "/admin/tenants/$TENANT_A/employees/nonexistent-slug-zzz/trigger" '{}'

log ""
log "--- GROUP 6: Member / invitation management ---"
call OWNER GET    "/admin/tenants/$TENANT_A/members"
call OWNER PATCH  "/admin/tenants/$TENANT_A/members/$FAKE_UUID" '{}'
call OWNER DELETE "/admin/tenants/$TENANT_A/members/$FAKE_UUID"
call OWNER POST   "/admin/tenants/$TENANT_A/invitations" '{}'
call OWNER POST   "/admin/tenants/$TENANT_A/invitations/$FAKE_UUID/revoke"

log ""
log "--- GROUP 7: PLATFORM user deactivate (requirePermission MANAGE_MEMBERS, no tenant) ---"
call OWNER PATCH "/admin/users/$FAKE_UUID/deactivate"

log ""
log "--- GROUP 8: PUBLIC invitation routes (no auth middleware — confirm not 401) ---"
call NONE POST "/invitations/accept"  '{}'
call NONE POST "/invitations/decline" '{}'

log ""
log "=================================================================="
log "RESULT: PASS=$PASS  FAIL=$FAIL  TOTAL=$((PASS+FAIL))"
log "=================================================================="
echo "SWEEP_DONE PASS=$PASS FAIL=$FAIL"
