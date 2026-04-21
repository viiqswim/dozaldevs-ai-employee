# Supabase Init SQL Files

These SQL files initialize a new PostgreSQL database with the Supabase schema.
They are extracted from the official Supabase Postgres Docker image and version-pinned here.

## Source

- **Image**: `public.ecr.aws/supabase/postgres:17.6.1.064`
- **Container path**: `/docker-entrypoint-initdb.d/init-scripts/`
- **Extracted**: 2026-04-21

## Files (run in this order)

| File                                | Purpose                                 |
| ----------------------------------- | --------------------------------------- |
| `00-schema.sql`                     | pgbouncer schema setup                  |
| `00000000000000-initial-schema.sql` | Core extensions, roles, realtime schema |
| `00000000000001-auth-schema.sql`    | Auth schema and tables (GoTrue)         |
| `00000000000002-storage-schema.sql` | Storage schema                          |
| `00000000000003-post-setup.sql`     | Post-setup functions and dashboard user |

## How to Use

These files are run by `scripts/ensure-infra.sh` when creating a new project database.
The script runs them in alphabetical order against the new database using `supabase_admin` user.

## How to Update (when upgrading Postgres image version)

1. Update the image tag in `docker/shared-infra.yml`
2. Start a temporary container: `docker run -d --name temp-pg -e POSTGRES_PASSWORD=postgres <new-image>`
3. Copy new init scripts: `docker cp temp-pg:/docker-entrypoint-initdb.d/init-scripts/. docker/init/`
4. Stop and remove: `docker rm -f temp-pg`
5. Update the "Source" section in this README with the new image version
6. Commit the changes

## Critical Notes

- Run scripts as `supabase_admin` user (NOT `postgres` — it's demoted after image startup)
- Use TCP connection (`-h 127.0.0.1`) inside the container, not Unix socket
- After running init scripts, set `supabase_auth_admin` password: `ALTER USER supabase_auth_admin WITH PASSWORD 'postgres';`
- GoTrue requires `DB_NAMESPACE=auth` — do not change this
