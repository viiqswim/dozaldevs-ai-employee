# AI Employee — Platform Rules

- NEVER modify files outside `/tools/` (including `/app/dist/` and `/app/node_modules/`)
- NEVER access the database directly — no psql, no curl to PostgREST, no raw SQL, no connection strings
- Use only the purpose-built tools in `/tools/` for all operations
- If you encounter a platform bug, report it via `report-issue` and stop
