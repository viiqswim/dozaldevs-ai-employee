# search

**Description**: Semantic search over the employee knowledge base entries

**Invocation**: `tsx /tools/knowledge_base/search.ts [flags]`

**Environment variables**: SUPABASE_URL, SUPABASE_SECRET_KEY, TENANT_ID, OPENROUTER_API_KEY

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--query` | required | Natural language search query |
| `--limit` | optional | Max results to return (default: 5) |
