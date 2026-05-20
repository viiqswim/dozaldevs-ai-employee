# Learnings

## 2026-05-20 Plan Start: transcript-and-trigger-payload-fixes

### Key Conventions

- Dashboard dev server: http://localhost:7701 (dev, HMR) — use this for all Playwright QA
- Evidence dir: .sisyphus/evidence/ — screenshots and build output go here
- Single file change: dashboard/src/panels/tasks/TaskDetail.tsx (679 lines)
- CollapsibleJsonViewer component at lines 126-171 — already handles collapse, expand, truncation at 2000 chars
- `defaultOpen=false` is the default for CollapsibleJsonViewer — no need to pass it explicitly
- RawEventViewer component at lines 71-124 — rename string labels only, keep prop/function names

### Critical Line Numbers (as of plan creation — may shift after T1 edits)

- ContentBlock interface: 182-190 (DELETE in T1)
- ToolCallBlock component: 192-213 (DELETE in T1)
- TranscriptMessage component: 215-280 (DELETE in T1)
- Transcript rendering section: 657-662 (MODIFY in T1)
- RawEventViewer null branch label "Raw Event": line 84 (MODIFY in T2)
- RawEventViewer null branch empty state: line 86 (MODIFY in T2)
- RawEventViewer non-null branch label "Raw Event": line 104 (MODIFY in T2)

### Test Task URLs

- Motivation-bot (has transcript, null raw_event): http://localhost:7701/dashboard/tasks/a78292b7-7f67-41d5-b096-1efa64d0d9a6?tenant=00000000-0000-0000-0000-000000000003
- Guest-messaging (has raw_event): http://localhost:7701/dashboard/tasks/81607010-78ce-4737-b246-2a84bbb22ce5?tenant=00000000-0000-0000-0000-000000000003

### Commit Strategy

- ONE commit covering T1 + T2 together
- Message: `fix(dashboard): render session transcript as collapsible JSON and rename Raw Event to Trigger Payload`
- Pre-commit check: pnpm build

## 2026-05-20 T1 Complete
- Deleted: ContentBlock interface, ToolCallBlock component, TranscriptMessage component
- Modified: transcript rendering loop — now uses CollapsibleJsonViewer
- Build: PASS (zero TypeScript errors, exit code 0)
- Line number delta: original ~679 lines, now ~583 lines (-96 lines)

## 2026-05-20 T2 Complete
- Renamed "Raw Event" → "Trigger Payload" in both null and non-null branches of RawEventViewer
- Updated empty state: "No raw event data" → "This task was not triggered by a webhook, so no payload was captured."
- Commit: 2168b95
- Build: PASS
