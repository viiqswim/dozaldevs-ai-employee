# Issues / Gotchas

## [2026-06-13] Known Production Bug

- `archetype-generator.ts:126` reads `process.cwd() + '/src/worker-tools'` at request time
- `Dockerfile.gateway` does NOT copy `src/worker-tools/` into runtime image
- Result: wizard silently falls back to empty tool catalog in production
- Fix: T2 startup cache eliminates the request-time disk read structurally

## Guardrails (MUST NOT violate)

- MUST NOT touch deprecated files: `src/inngest/lifecycle.ts`, `src/inngest/redispatch.ts`, `src/workers/lib/` (on-hold utilities), `src/workers/generic-harness.mts`, `src/workers/orchestrate.mts`, `src/workers/entrypoint.sh`, `src/workers/tools/registry.ts`
- MUST NOT change autoupdate:false, OpenCode 1.14.31 pin, approved model list
- MUST NOT enable enforcement globally — flag defaults OFF
