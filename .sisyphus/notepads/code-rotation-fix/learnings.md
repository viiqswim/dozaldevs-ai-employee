# Learnings — code-rotation-fix

## [2026-05-13] Research Findings

### Sifely API — Permanent Passcode Creation

- `addType: '2'` = gateway delivery method (NOT passcode type)
- `keyboardPwdType` can be sent explicitly as a parameter to `/v3/keyboardPwd/add`
- vlre-hub sends `keyboardPwdType: String(params.keyboardPwdType)` explicitly (sifely.adapter.ts line 323)
- Current ai-employee code does NOT send `keyboardPwdType` — relies on inference from startDate/endDate
- Fix: add `keyboardPwdType: '2'` to the URLSearchParams in `createPasscode()`

### vlre-hub Rotation Architecture

- Two-phase: scanForCheckouts() → creates PENDING records, executeAll() → processes them
- Checkout filtering: calls Hostfully `getLeadsByPropertyAndDate(propertyUid, scanDate)` per property
- Per-lock: delete-old + create-new pattern (not update-in-place)
- Error handling: 3 retries with exponential backoff, per-property failures don't stop batch
- Gateway offline (-2012), lock memory full (-4056), gateway busy (-3003) = non-retryable errors

### Test Property State

- Lock 24572672 now in property_locks for property c960c8d2 (added during F3 testing)
- Hostfully door_code custom field exists for c960c8d2 (user created it, value: 4545)
- Lock 24572672 currently has NO permanent (type 2) passcodes — only timed (type 3)
- Sifely credentials: SIFELY_USERNAME=admin@vlrealestate.co, SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58
