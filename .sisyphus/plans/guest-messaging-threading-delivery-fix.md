# Fix Guest-Messaging Slack Threading + Delivery Verification

## TL;DR

> **Quick Summary**: Fix two bugs in the VLRE guest-messaging employee: (1) Slack messages for the same task post as separate top-level messages instead of threading under one parent, and (2) the lifecycle reports "Sent to guest" even when the Hostfully message was never actually sent.

## TODOs

- [x] 1. Fix pre-existing test mismatches in harness delivery tests
- [x] 2. Add `--thread-ts` flag to `post-guest-approval.ts` with tests
- [x] 3. Add `--thread-ts` flag to `post-no-action-notification.ts` with tests
- [x] 4. Add delivery verification to harness delivery phase + tests
- [x] 5. Inject `NOTIFY_MSG_TS` into executing machine env + tests
- [x] 6. Update seed.ts instructions with `--thread-ts` + re-seed DB
- [x] 7. Rebuild Docker image
- [x] 8. Run full test suite + final verification

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

- [ ] F1. **Plan Compliance Audit** — `oracle`
- [ ] F2. **Code Quality Review** — `unspecified-high`
- [ ] F3. **Real Manual QA** — `unspecified-high`
- [ ] F4. **Scope Fidelity Check** — `deep`

- [ ] 9. **Notify completion** — Send Telegram notification: plan `guest-messaging-threading-delivery-fix` complete, all tasks done, come back to review results.
