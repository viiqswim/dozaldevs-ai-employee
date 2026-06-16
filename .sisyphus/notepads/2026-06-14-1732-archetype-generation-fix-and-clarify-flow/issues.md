# Issues

## [2026-06-14] Pre-existing Issues (not regressions)

- container-boot.test.ts skips when Docker unavailable — expected
- inngest-serve.test.ts may have function count mismatch — pre-existing, do not fix

## [2026-06-15] Task 11 BLOCKER — converse-create proposal fails PROPOSAL_INVALID (live LLM)

The clarify-then-act creation flow cannot complete a draft save with the real LLM. Both an ambiguous and a clear prompt reached a server proposal but the `converse-create` route returned HTTP 422 `PROPOSAL_INVALID`, so the wizard never reaches the edit step and no draft is created.

Cause: the live `converse()` LLM emits `tool_registry.tools` in the wrong shape (bare `slack/post-message` strings, or objects → `[object Object]`), and `trigger_sources` invalid. `validateProposalFields`/`validateTools` (src/gateway/lib/archetype-edit-helpers.ts) requires exact canonical `/tools/{service}/{tool}.ts` strings. `postProcess()` does not normalize tool entries. The `generate` route doesn't run this validator (so T7 passed); `converse-create` + `propose-edit` do.

Misleading trace: `archetype_generation_calls` shows `status=success` for the failed proposal because the route records success BEFORE validation runs; validation rejections never reach the `status=failed` catch.

Fix direction (not implemented in T11): add a concrete tool_registry shape example + "full /tools/ paths, never objects" rule to CONVERSE_SYSTEM_PROMPT_PRE, and/or add tool-path normalization to postProcess() so both generate and converse self-heal. See learnings.md Task 11 for full detail and the exact 422 bodies.

Impact: This is the core deliverable of the plan (clarify-then-act creation). The UI mechanics (question → answer → friendly errors → start over → URL convention) all work; the proposal-validation gate is the blocker.

## [2026-06-15] Task 11 RE-RUN — tool-path fix (bb5025d3) confirmed; NEW residual blocker: trigger_sources

bb5025d3 ("normalize bare tool paths in postProcess") FIXED the tool-path half of PROPOSAL_INVALID — both scenarios' 422 bodies now have zero tool errors. BUT converse-create still 422s on the OTHER half: `trigger_sources: "Invalid input"`. Draft still never created.

Root cause (isolated Zod repro + explore bg_10577a9d): strict `TriggerSourceSchema` (z.union in archetype-edit-helpers.ts:7 AND admin-archetypes.ts:28) accepts only `{type:'manual'|'scheduled'(+cron)|'webhook'}`. The converse LLM gets NO trigger_sources shape example in `CONVERSE_SYSTEM_PROMPT_PRE` (or REFINE), so it emits a non-conforming shape (e.g. `type:'cron'`/`expression`, or `scheduled` missing required `cron`). Seed data ALSO uses divergent shapes (`{type:'cron',expression}`, `{type:'cron_and_webhook',cron_expression}`) that the validator rejects — seed is the odd one out. Same generate-vs-converse asymmetry as the tool bug: only converse-create/propose-edit strictly validate.

Fix direction (not implemented): (1) normalize trigger_sources in postProcess() like the tool-path fix; (2) add a trigger_sources example to CONVERSE/REFINE prompts; (3) reconcile seed + both Zod schemas to one canonical shape. Also: converse-create trace stores empty `response` — can't recover the failing shape from DB; consider persisting it.

See learnings.md "Task 11 RE-RUN" for full repro output and the exact accept/reject matrix.

## [2026-06-15] Task 11 FINAL RE-RUN — both proposal fixes work; NEW 3rd blocker at SAVE: risk_model.timeout_hours

Both committed fixes confirmed working end-to-end: bb5025d3 (tool paths) + 9a3c8404 (trigger_sources). The wizard now REACHES the edit step + Preview AGENTS.md in BOTH scenarios (impossible in prior runs — they 422'd at converse-create). Zero tool errors, zero trigger_sources errors.

NEW blocker: the final `POST /admin/tenants/:id/archetypes` (Save as Draft) returns 400 in BOTH scenarios:
`{"error":"INVALID_REQUEST","issues":[{"path":["risk_model","timeout_hours"],"message":"...expected number, received undefined"}]}`. DB confirms no draft created (no t11-* rows).

Root cause (explore bg_31611f74, file:line): `applyCreateAllowlist()` (admin-archetype-converse-create.ts ~line 87) strips risk_model to `{approval_required}` only → client sends partial risk_model → POST schema (admin-archetypes.ts:90-95) `.default({...timeout_hours:2})` does NOT fire for a present-but-partial object, so required inner `timeout_hours` fails. postProcess never defaults it.

Cleanest fix (NOT implemented): pass timeout_hours through in applyCreateAllowlist (line 87): `{ approval_required, timeout_hours: raw.risk_model.timeout_hours }`. Defense-in-depth: admin-archetypes.ts:93 → `timeout_hours: z.number().positive().optional().default(2)`. No client/postProcess change needed.

Pattern note: this is the SAME class of bug as the prior two — a field the converse allowlist drops that a strict downstream validator requires. Worth auditing applyCreateAllowlist against the POST /archetypes schema for any OTHER stripped-but-required fields before re-testing.

Zod gotcha (reusable): `z.object({...}).default({...})` only applies when the whole key is absent; a partial object bypasses it. Put defaults on inner fields when callers may send partial objects.

See learnings.md "Task 11 FINAL RE-RUN" for full network trace and evidence.

## [2026-06-15] Task 11 PASS — but NEW intermittent residual: tsx-prefix in tool_registry.tools

GOOD: All 4 committed fixes work. Both scenarios saved a draft end-to-end this run (2 new archetypes: 3c1331f0 t11-slack-summarizer-final, ba8f064d t11-support-digest-final). The d6dc375e timeout_hours fix is proven (Save → detail page; Maximum Duration=24).

RESIDUAL (intermittent, NOT yet fixed): converse-create can still 422 PROPOSAL_INVALID when the LLM emits tool_registry.tools entries WITH a leading `tsx ` prefix (e.g. `tsx /tools/slack/read-channels.ts`). Happened on Scenario A attempt 1; did NOT happen on Scenario B or Scenario A retry — so ~1/3 of runs.

Root cause (explore bg_2c20ddf8 + direct read): bb5025d3's tool normalization in postProcess() (archetype-generator.ts:387-400) only handles bare `service/tool` and already-correct `/tools/..`; it leaves `tsx /tools/..` UNCHANGED (startsWith('/tools/') false; split('/') has 4 parts not 2). validateTools() allowed-Set has tsx stripped, so the prefixed form misses → reject. LLM copies the `tsx /tools/..` invocation form from the prompt's Available Tools list (rendered via toolInvocationPath which includes `tsx `).

Cleanest fix (one line, not implemented): in postProcess() tool .map() add `const normalized = t.replace(/^tsx\s+/, '')` and use `normalized` for the checks/return. Do NOT touch validateTools(). Same recurring class as the prior 3 blockers.

Recommendation: apply this 4th normalization fix, then one final confirmation run, to make the flow 100% reliable. Functional now, but first-attempt success is LLM-output-dependent.

See learnings.md "Task 11 PASS (4th re-run...)" for full trace, the exact .map() fix, and evidence.
