# Issues — delivery-tunnel-url-rootfix

## [2026-06-16] Known Issues

### Pre-existing test skips (NOT failures)

- `container-boot.test.ts` — skips when Docker unavailable (expected)
- `inngest-serve.test.ts` — function count mismatch (pre-existing, do not fix)

### Production constraints

- Render deploy is the fix ship path (bug is in src/inngest/ = gateway process)
- Fly worker image rebuild is orthogonal to this fix
- Must NOT re-trigger stuck task before deploy is confirmed `live`
