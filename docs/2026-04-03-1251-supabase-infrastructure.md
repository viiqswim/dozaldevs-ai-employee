# Supabase Local Development Infrastructure

## Overview

This repository uses a self-hosted Supabase Docker Compose stack for local development,
instead of the Supabase CLI (`supabase start`). This approach allows multiple projects
to run simultaneously on the same machine using unique port ranges.

**Why not `supabase start`?**
The Supabase CLI hardcodes `database: "postgres"` in its Go source and connects PostgREST
to that database. Since PostgREST, Auth, and Storage each connect to ONE database, the CLI
approach prevents running multiple projects simultaneously. The self-hosted Docker Compose
uses `${POSTGRES_DB}` throughout, so all services connect to this project's database.

## Quick Start

```bash
pnpm setup
```

This command:

1. Stops any Supabase CLI containers that might conflict
2. Creates `docker/.env` from `docker/.env.example` (if not exists)
3. Starts all 14 Supabase services via Docker Compose
4. Waits for Kong/PostgREST to be healthy (up to 4 minutes)
5. Runs Prisma migrations
6. Seeds the database
7. Builds the Docker worker image (`ai-employee-worker:latest`)

> **Note**: The worker image must be rebuilt after any changes to `src/workers/`. Run
> `docker build -t ai-employee-worker:latest .` before triggering a new E2E run.

## Port Allocation

This project uses port range **543xx** to avoid conflicts with other projects.

| Service            | Port  |
| ------------------ | ----- |
| Kong (API Gateway) | 54321 |
| PostgreSQL         | 54322 |
| Supabase Studio    | 54323 |
| Inbucket (Email)   | 54324 |
| Supavisor (Pool)   | 54325 |
| Analytics          | 54327 |

### All Projects Port Map

| Project      | Kong  | PostgreSQL | Studio |
| ------------ | ----- | ---------- | ------ |
| ai-employee  | 54321 | 54322      | 54323  |
| nexus-stack  | 55321 | 55322      | 55323  |
| vlre-hub     | 56321 | 56322      | 56323  |
| fetched-pets | 57321 | 57322      | 57323  |

**Future repos**: use 58321, 58322, 58323 (pattern: `5{N}3xx`)

## Configuration

The Supabase stack is configured in `docker/`:

- `docker-compose.yml` — All 14 services. Identical template across all repos.
- `.env.example` — Port assignments and database name for this project
- `.env` — Created automatically from `.env.example` on first run (not committed)
- `volumes/db/` — PostgreSQL init scripts (SQL run on first database start)

All host-facing ports are parameterized via env vars:

```
COMPOSE_PROJECT_NAME=ai-employee   # Docker project isolation
POSTGRES_DB=ai_employee            # Database name
KONG_HTTP_PORT_HOST=54321          # API Gateway
POSTGRES_PORT_HOST=54322           # PostgreSQL
STUDIO_PORT_HOST=54323             # Studio
```

## Useful Commands

```bash
# Start Supabase (and build worker image)
pnpm setup

# Start dev services (Gateway + Inngest) after Supabase is running
pnpm dev:start

# Stop Supabase
docker compose -f docker/docker-compose.yml down

# Reset (delete all data and start fresh)
pnpm dev:start --reset

# Check status
docker compose -f docker/docker-compose.yml ps

# Open Studio
open http://localhost:54323

# Connect to database
psql postgresql://postgres:postgres@localhost:54322/ai_employee

# Trigger a full E2E run
pnpm trigger-task

# Verify E2E results
pnpm verify:e2e --task-id <uuid>
```

## Adding a New Project

When adding a new project that needs local Supabase:

1. **Choose the next port range**: `5{N}3xx` (ai-employee=4, nexus-stack=5, vlre-hub=6, fetched-pets=7, new=8, etc.)
2. **Copy the `docker/` directory** from this repo to the new project
3. **Update `docker/.env.example`**: Set `COMPOSE_PROJECT_NAME`, `POSTGRES_DB`, and all port vars to the new range
4. **Create `docker/volumes/db/{new_db}_grants.sql`**: Copy and rename from existing grants file
5. **Update/create setup script**: Copy `scripts/setup.ts` and update port references
6. **Update the project's `.env`/`.env.example`**: Set `DATABASE_URL` to point to new PostgreSQL port and database

## Known Limitations

1. **First startup takes 3-5 minutes**: Supabase pulls and initializes 14 containers.
2. **Analytics startup can be slow**: Logflare (analytics) may need 2-3 minutes to become healthy. The setup script automatically retries `docker compose up -d` every 30 seconds until Kong responds (up to 4 minutes total).
3. **Starting all projects simultaneously**: If starting 4+ projects at the same time, resource contention can slow startup. Start projects sequentially for best results.
4. **~14 containers per project**: Each project runs its own full Supabase stack. Running all 4 projects requires ~56 containers.
5. **Database data persists between `down` and `up`**: Data is in Docker volumes (not containers), so `docker compose down` preserves data. Use `docker compose down -v` (the reset command) to wipe data.
6. **Worker image rebuild required**: Any change to `src/workers/` requires `docker build -t ai-employee-worker:latest .` before the fix takes effect in E2E runs.

## Troubleshooting

**Kong not responding after 4 minutes**:

```bash
# Check container status
docker compose -f docker/docker-compose.yml ps

# Check analytics (the bottleneck)
docker compose -f docker/docker-compose.yml logs analytics --tail=20

# Force restart
docker compose -f docker/docker-compose.yml down && pnpm setup
```

**Port already in use**:

```bash
# Find what's using the port
lsof -i :54321

# Check if another project is running
docker ps | grep supabase
```

**Database doesn't exist**:

```bash
# Run setup again (idempotent)
pnpm setup
```

**Supabase CLI conflict** (if you were using `supabase start`):

```bash
supabase stop
pnpm setup
```

**Worker container can't reach PostgREST**:
The worker uses PostgREST at `http://localhost:54321` (Kong). If the worker container
can't reach it, check that `SUPABASE_URL` in `.env` points to the correct port and that
Kong is healthy (`docker compose -f docker/docker-compose.yml ps`).

## Security Note

> **DO NOT use these credentials in production.** The JWT secrets, API keys, and
> passwords in `docker/.env.example` are for local development only.

For production, use your Supabase cloud project with its own credentials.
