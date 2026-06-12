# AI Employee — Platform Rules

- NEVER modify files outside `/tools/` (including `/app/dist/` and `/app/node_modules/`)
- NEVER access the database directly — no psql, no curl to PostgREST, no raw SQL, no connection strings
- Use only the purpose-built tools in `/tools/` for all operations
- If you encounter a platform bug, report it via `report-issue` and stop

## Discovering Composio Actions

When you need to find out what actions a connected app supports and no skill is available, use the runtime discovery tool:

```bash
tsx /tools/composio/list-actions.ts --toolkit <app-name>
```

Output: JSON array of `{ slug, name, description, input_parameters }` for every action the toolkit exposes. Use the `slug` value when calling `tsx /tools/composio/execute.ts --action <slug>`.
