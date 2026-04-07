# Infrastructure Templates

Shared Supabase Docker Compose infrastructure templates for spinning up new projects on the self-hosted Supabase stack.

## Contents

- `docker-compose-template.yml` — Parameterized Supabase Docker Compose with `${POSTGRES_DB}`, `${KONG_HTTP_PORT_HOST}`, etc. Copy to target project's `docker/` and set env vars.
- `env-ai-employee.example` — Environment template for the ai-employee project
- `env-fetched-pets.example` — Environment template for the fetched-pets project
- `env-nexus-stack.example` — Environment template for the nexus-stack project
- `env-vlre-hub.example` — Environment template for the vlre-hub project
- `fetched_pets_grants.sql` — PostgreSQL GRANT statements for the fetched_pets database
- `nexus_stack_grants.sql` — PostgreSQL GRANT statements for the nexus_stack database
- `vlre_hub_grants.sql` — PostgreSQL GRANT statements for the vlre_hub database

## Usage

1. Copy `docker-compose-template.yml` to the target project's `docker/docker-compose.yml`
2. Copy the matching `env-<project>.example` to `docker/.env` and fill in real values
3. Create the project database in PostgreSQL
4. Run the matching `<project>_grants.sql` against the new database: `psql $DATABASE_URL -f <grants-file>`

For background, see `.sisyphus/plans/shared-supabase-infra.md`.
