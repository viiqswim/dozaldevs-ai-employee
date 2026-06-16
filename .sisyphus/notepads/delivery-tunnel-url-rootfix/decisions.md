# Decisions — delivery-tunnel-url-rootfix

## [2026-06-16] Architectural Decisions

### Decision: New file `worker-url-resolver.ts` (not added to existing module)

- Rationale: Clean separation, easy to grep, clear single-purpose module
- Location: `src/inngest/lifecycle/lib/worker-url-resolver.ts`

### Decision: Keep exact boolean expression from execution path

- `WORKER_RUNTIME === 'fly' && process.env.TUNNEL_URL` — do NOT change order
- Docker runtime must win even if TUNNEL_URL is set

### Decision: No full buildWorkerEnv() refactor

- Out of scope, regression risk to working execution path
- Note as recommended follow-up only

### Decision: P2 items deferred

- `MESSAGE_UID`/`OVERRIDE_DIRECTION`/`INPUT_*` — only proven needed for guest-messaging delivery
- Separate ticket

### Decision: Remediation order

- Task 9 (remediate stuck task) ONLY after Task 8 (prod E2E confirmed live)
- Cannot resume stuck task — Inngest memoization would replay the throw
