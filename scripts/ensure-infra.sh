#!/usr/bin/env bash
# ensure-infra.sh — 3-state idempotent Supabase infrastructure startup for ai-employee
#
# States handled:
#   1. FRESH:    No containers → create network, start shared-infra, create DB, start project services
#   2. PARTIAL:  Shared infra running, project services missing → start project services only
#   3. COMPLETE: Everything running → no-op, print status, exit 0
#
# Usage:
#   bash scripts/ensure-infra.sh
#
# Requirements:
#   - Docker must be running
#   - docker compose v2 must be available

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_DIR="$REPO_ROOT/docker"

SHARED_NETWORK="supabase-shared"
SHARED_POSTGRES_CONTAINER="shared-postgres"
PROJECT_AUTH_CONTAINER="ai-employee-auth"
PROJECT_KONG_CONTAINER="ai-employee-kong"
DB_NAME="ai_employee"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-54322}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_success() { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

container_running() {
  docker inspect --format '{{.State.Running}}' "$1" 2>/dev/null | grep -q "true"
}

container_healthy() {
  local status
  status=$(docker inspect --format '{{.State.Health.Status}}' "$1" 2>/dev/null)
  [ "$status" = "healthy" ]
}

wait_healthy() {
  local container="$1"
  local max_wait="${2:-60}"
  local elapsed=0
  log_info "Waiting for $container to become healthy..."
  while ! container_healthy "$container"; do
    if [ $elapsed -ge $max_wait ]; then
      log_error "$container did not become healthy within ${max_wait}s"
      docker logs "$container" --tail 20 >&2
      return 1
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  log_success "$container is healthy"
}

network_exists() {
  docker network inspect "$1" &>/dev/null
}

ensure_network() {
  if network_exists "$SHARED_NETWORK"; then
    log_success "Network '$SHARED_NETWORK' already exists"
  else
    log_info "Network '$SHARED_NETWORK' will be created by docker compose"
  fi
}

start_shared_infra() {
  log_info "Starting shared infrastructure..."
  docker compose -f "$DOCKER_DIR/shared-infra.yml" up -d
  wait_healthy "$SHARED_POSTGRES_CONTAINER" 60
}

db_exists() {
  docker exec "$SHARED_POSTGRES_CONTAINER" \
    psql -h 127.0.0.1 -U supabase_admin -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"
}

init_database() {
  log_info "Creating database '$DB_NAME'..."
  docker exec "$SHARED_POSTGRES_CONTAINER" \
    psql -h 127.0.0.1 -U supabase_admin -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || {
    log_warn "Database '$DB_NAME' may already exist, continuing..."
  }

  log_info "Running Supabase init SQL files against '$DB_NAME'..."
  for sql_file in $(ls "$DOCKER_DIR/init/"*.sql | sort); do
    log_info "  Running $(basename "$sql_file")..."
    docker exec -i "$SHARED_POSTGRES_CONTAINER" \
      psql -h 127.0.0.1 -U supabase_admin -d "$DB_NAME" < "$sql_file" 2>&1 | grep -v "^$" | grep -v "^SET$" | grep -v "^CREATE" | grep -v "^INSERT" | grep -v "^GRANT" | grep -v "^ALTER" | grep -v "^DROP" | grep -v "^COMMENT" | grep -v "^DO$" || true
  done

  log_info "Setting supabase_auth_admin password..."
  docker exec "$SHARED_POSTGRES_CONTAINER" \
    psql -h 127.0.0.1 -U supabase_admin -c "ALTER USER supabase_auth_admin WITH PASSWORD '$POSTGRES_PASSWORD';" 2>/dev/null || true

  log_info "Configuring supabase_auth_admin search_path..."
  docker exec "$SHARED_POSTGRES_CONTAINER" \
    psql -h 127.0.0.1 -U supabase_admin -d "$DB_NAME" -c \
    "ALTER USER supabase_auth_admin SET search_path TO auth, extensions, public;" 2>/dev/null || true

  log_info "Granting postgres user access to auth schema for seeding..."
  docker exec "$SHARED_POSTGRES_CONTAINER" \
    psql -h 127.0.0.1 -U supabase_admin -d "$DB_NAME" -c "
      GRANT ALL ON SCHEMA auth TO postgres;
      GRANT ALL ON ALL TABLES IN SCHEMA auth TO postgres;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO postgres;
      ALTER USER postgres SET search_path TO public, auth, extensions;
    " 2>/dev/null || true

  log_info "Marking GoTrue bootstrap migration '00' as applied in auth.schema_migrations..."
  docker exec "$SHARED_POSTGRES_CONTAINER" \
    psql -h 127.0.0.1 -U supabase_admin -d "$DB_NAME" \
    -c "INSERT INTO auth.schema_migrations(version) VALUES ('00') ON CONFLICT DO NOTHING;" 2>/dev/null || true

  log_success "Database '$DB_NAME' initialized"
}

start_project_services() {
  log_info "Starting ai-employee project services (Auth + Kong + PostgREST)..."
  docker compose -f "$DOCKER_DIR/supabase-services.yml" --env-file "$DOCKER_DIR/.env" up -d
  wait_healthy "$PROJECT_AUTH_CONTAINER" 60
  wait_healthy "$PROJECT_KONG_CONTAINER" 30
}

print_status() {
  echo ""
  echo -e "${GREEN}=== ai-employee Infrastructure Status ===${NC}"
  docker ps \
    --filter "name=shared-postgres" \
    --filter "name=shared-mailpit" \
    --filter "name=shared-redis" \
    --filter "name=ai-employee-auth" \
    --filter "name=ai-employee-kong" \
    --filter "name=ai-employee-rest" \
    --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
  echo ""
  echo -e "${GREEN}Supabase URL:${NC} http://localhost:54331"
  echo -e "${GREEN}Mailpit UI:${NC}   http://localhost:54325"
  echo ""
}

main() {
  log_info "Checking ai-employee infrastructure state..."

  SHARED_RUNNING=false
  PROJECT_RUNNING=false

  if container_running "$SHARED_POSTGRES_CONTAINER"; then
    SHARED_RUNNING=true
  fi

  if container_running "$PROJECT_AUTH_CONTAINER" && container_running "$PROJECT_KONG_CONTAINER"; then
    PROJECT_RUNNING=true
  fi

  if $SHARED_RUNNING && $PROJECT_RUNNING; then
    log_success "State: COMPLETE — all services already running"
    print_status
    exit 0
  fi

  if $SHARED_RUNNING && ! $PROJECT_RUNNING; then
    log_info "State: PARTIAL — shared infra running, starting project services..."
    ensure_network
    if ! db_exists; then
      log_info "Database '$DB_NAME' not found, initializing..."
      init_database
    else
      log_success "Database '$DB_NAME' already exists"
      docker exec "$SHARED_POSTGRES_CONTAINER" \
        psql -h 127.0.0.1 -U supabase_admin -c "ALTER USER supabase_auth_admin WITH PASSWORD '$POSTGRES_PASSWORD';" 2>/dev/null || true
    fi
    start_project_services
    print_status
    exit 0
  fi

  log_info "State: FRESH — starting all infrastructure from scratch..."
  ensure_network
  start_shared_infra
  init_database
  start_project_services
  print_status

  log_success "ai-employee infrastructure is ready!"
}

main "$@"
