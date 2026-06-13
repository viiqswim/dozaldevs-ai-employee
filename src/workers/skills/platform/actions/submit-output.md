# submit-output

**Description**: Submit task output (summary and optional draft file) to the platform

**Invocation**: `tsx /tools/platform/submit-output.ts [flags]`

**Environment variables**: SUPABASE_URL, SUPABASE_SECRET_KEY, TASK_ID

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--summary` | required | Short summary of what was done |
| `--classification` | required | NEEDS_APPROVAL or NO_ACTION_NEEDED |
| `--draft-file` | optional | Path to file containing the full draft deliverable |
