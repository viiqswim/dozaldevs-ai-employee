# Learnings — gm12-unresponded-message-monitor

## [2026-04-30] Session Start

### Archetype Seed Pattern

- Use `(prisma.archetype as any).upsert` — the `archetype` model requires this cast
- `tenant_id` goes in `create` block ONLY — NOT in `update` block (immutable)
- `department_id` goes in BOTH `create` and `update`
- Follow `vlreGuestMessaging` block at `prisma/seed.ts` lines 3205–3266 exactly
- New archetype UUID: `00000000-0000-0000-0000-000000000016`
- VLRE tenant ID: `00000000-0000-0000-0000-000000000003`
- VLRE department ID: `00000000-0000-0000-0000-000000000021`
- `PLATFORM_AGENTS_MD` is read via `fs.readFileSync` at top of `seed.ts` — just reference it

### serve.ts Lines to Remove (T2)

- Line 13: `import { createUnrespondedMessageAlertTrigger } from '../../inngest/triggers/unresponded-message-alert.js';`
- Line 38: `const unrespondedAlertFn = createUnrespondedMessageAlertTrigger(inngest);`
- Line 53: `unrespondedAlertFn,` (in functions array)

### Trigger Pattern (summarizer-trigger.ts)

- Factory: `createXxx(inngest: Inngest): InngestFunction.Any`
- Step 1 `discover-archetypes`: fetch `archetypes?role_name=eq.{slug}&select=id,tenant_id`
- Step 2: loop → `createTaskAndDispatch({ inngest, step, tenantId, archetypeSlug, externalId, sourceSystem: 'cron' })`
- externalId for monitor: `monitor-${tenantId}-${slotKey}` where `slotKey = Math.floor(Date.now() / (30 * 60 * 1000))`
- Register in serve.ts: import factory, instantiate, add to functions array

### Test Pattern (summarizer-trigger.test.ts)

- `vi.hoisted()` for mock functions
- `vi.mock()` for module replacement
- `vi.stubGlobal('fetch', ...)` for PostgREST calls
- Extract handler: `mockInngest.createFunction.mock.calls[0][1]`
- Call handler with `{ step: mockStep }`

### Prompt File Pattern (guest-messaging.ts)

- Named exports: `export const SYSTEM_PROMPT = ...`
- Import in seed.ts at top with other prompt imports

### Pre-existing Test Failures (DO NOT FIX)

- `container-boot.test.ts`
- `inngest-serve.test.ts`
- `tests/inngest/integration.test.ts`
