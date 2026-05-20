# Issues — observability-strategy

## Known Risks

- Wave 3 tasks (8-13) all modify TaskDetail.tsx — potential merge conflicts. Atlas must coordinate so each task touches a DIFFERENT section of the file, OR they are done sequentially.
- Assumption A1 (unvalidated): OpenCode transcript API returns per-message cost/token data. Task 3 must validate this and implement fallback (return zeros + log warning if fields absent).
- PostgREST schema reload: after migration, MUST run `NOTIFY pgrst, 'reload schema'` or PostgREST returns 400 for new columns.
- Docker image rebuild required after any harness/worker change.

## Pre-existing Test Failures (do NOT fix)

- container-boot.test.ts — requires Docker socket
- inngest-serve.test.ts — hardcoded function count assertion
