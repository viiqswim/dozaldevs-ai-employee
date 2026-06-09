## Summary

<!-- What does this PR do? -->

## Checklist

- [ ] Queries are tenant-scoped (every DB query filters by `tenant_id`)
- [ ] Soft-delete only — no `DELETE` or `.delete()` calls
- [ ] Shared files are employee-agnostic (no employee-specific language in `src/gateway/`, `src/inngest/employee-lifecycle.ts`, `src/lib/`)
- [ ] `pnpm lint` passes with zero warnings
- [ ] `pnpm test -- --run` passes (unit suite)
- [ ] AGENTS.md updated if new routes, tools, models, or employees were added
- [ ] No hardcoded secrets or personal credentials
