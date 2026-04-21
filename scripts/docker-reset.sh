#!/usr/bin/env bash
# docker-reset.sh — Project-scoped database reset for ai-employee
#
# ONLY affects the 'ai_employee' database — never touches other project databases.
#
# Steps:
#   1. Confirm with user (destructive operation)
#   2. Drop 'ai_employee' database
#   3. Create 'ai_employee' database
#   4. Run Supabase init SQL files
#   5. Set supabase_auth_admin password
#   6. Run Prisma migrations
#
# Usage:
#   bash scripts/docker-reset.sh
#   bash scripts/docker-reset.sh --yes   (skip confirmation)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_DIR="$REPO_ROOT/docker"

DB_NAME="ai_employee"
POSTGRES_CONTAINER="shared-postgres"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_success() { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

SKIP_CONFIRM=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) SKIP_CONFIRM=true ;;
  esac
done

if ! docker inspect --format '{{.State.Running}}' "$POSTGRES_CONTAINER" 2>/dev/null | grep -q "true"; then
  log_error "shared-postgres is not running. Start it first: bash scripts/ensure-infra.sh"
  exit 1
fi

if ! $SKIP_CONFIRM; then
  echo -e "${RED}WARNING: This will DESTROY all data in the '$DB_NAME' database.${NC}"
  echo -e "${YELLOW}Other project databases (nexus, etc.) will NOT be affected.${NC}"
  echo ""
  read -r -p "Continue? [y/N] " response
  case "$response" in
    [yY][eE][sS]|[yY]) ;;
    *)
      log_info "Aborted."
      exit 0
      ;;
  esac
fi

log_info "Resetting '$DB_NAME' database..."

log_info "Dropping database '$DB_NAME'..."
docker exec "$POSTGRES_CONTAINER" \
  psql -h 127.0.0.1 -U supabase_admin -c "DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE);" 2>/dev/null || {
  docker exec "$POSTGRES_CONTAINER" \
    psql -h 127.0.0.1 -U supabase_admin -c "
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
      DROP DATABASE IF EXISTS $DB_NAME;
    " 2>/dev/null || true
}
log_success "Database '$DB_NAME' dropped"

log_info "Creating database '$DB_NAME'..."
docker exec "$POSTGRES_CONTAINER" \
  psql -h 127.0.0.1 -U supabase_admin -c "CREATE DATABASE $DB_NAME;"
log_success "Database '$DB_NAME' created"

log_info "Running Supabase init SQL files..."
for sql_file in $(ls "$DOCKER_DIR/init/"*.sql | sort); do
  log_info "  Running $(basename "$sql_file")..."
  docker exec -i "$POSTGRES_CONTAINER" \
    psql -h 127.0.0.1 -U supabase_admin -d "$DB_NAME" < "$sql_file" 2>&1 | \
    grep -v "^$" | grep -v "^SET$" | grep -v "^CREATE" | grep -v "^INSERT" | \
    grep -v "^GRANT" | grep -v "^ALTER" | grep -v "^DROP" | grep -v "^COMMENT" | \
    grep -v "^DO$" || true
done
log_success "Supabase schema initialized"

log_info "Setting supabase_auth_admin password..."
docker exec "$POSTGRES_CONTAINER" \
  psql -h 127.0.0.1 -U supabase_admin -c "ALTER USER supabase_auth_admin WITH PASSWORD '$POSTGRES_PASSWORD';" 2>/dev/null || true

log_info "Marking GoTrue bootstrap migration '00' as applied..."
docker exec "$POSTGRES_CONTAINER" \
  psql -h 127.0.0.1 -U supabase_admin -d "$DB_NAME" \
  -c "INSERT INTO auth.schema_migrations(version) VALUES ('00') ON CONFLICT DO NOTHING;" 2>/dev/null || true
log_success "supabase_auth_admin configured"

log_info "Running Prisma migrations..."
cd "$REPO_ROOT"
npx prisma migrate deploy 2>&1 | tail -5 || {
  log_warn "migrate deploy failed, trying db push..."
  npx prisma db push --skip-generate 2>&1 | tail -5 || true
}
log_success "Prisma migrations applied"

echo ""
log_success "Database '$DB_NAME' has been reset successfully!"
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Start services if not running: bash scripts/ensure-infra.sh"
echo "  2. Seed application data: pnpm db:seed"
