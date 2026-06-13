# get-token

**Description**: Fetch a short-lived GitHub App installation token for git/gh CLI operations

**Invocation**: `tsx /tools/github/get-token.ts [flags]`

**Environment variables**: GITHUB_APP_ID, GITHUB_PRIVATE_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY, TENANT_ID

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--installation-id` | optional | GitHub App installation ID (resolved from tenant if omitted) |
