## fix-test-failures Notepad

## Baseline (Task 1)

- 20 failures across 5 files, ~1594 passing
- Groups A(9), B(6), C(3), D(1), E(1)
- Group B: delete lifecycle.test.ts (whole file — all deprecated)
- Groups C/D/E: inngest.send() called without server — fix with vi.spyOn(inngest, 'send').mockResolvedValue(undefined)
- The inngest instance is created inside each test file — must spyOn the existing instance, not vi.mock
- Group A: simple .text() missing from fetch mock objects

## Key Constraints

- MUST NOT modify src/ files — test-only fixes
- MUST NOT touch: inngest-serve.test.ts, container-boot.test.ts, inngest/integration.test.ts
- MUST NOT delete: tests/workers/lib/ (user decision: leave alone)
- inngest.send mock must come AFTER inngest instance creation in beforeEach

## Task 2 — interaction-handler.test.ts

- fetch mock objects need BOTH `json()` AND `text()` methods
- Production code calls `res.text()` on non-ok responses (line 245 of interaction-handler.ts)
- Also add `ok: true` to mock responses so the happy path does not hit the error branch
- Pattern: `{ ok: true, json: vi.fn().mockResolvedValue(...), text: vi.fn().mockResolvedValue("") }`
- All 4 mock response objects in beforeEach needed the fix (slack, feedback, knowledge_base_entries, fallback)
