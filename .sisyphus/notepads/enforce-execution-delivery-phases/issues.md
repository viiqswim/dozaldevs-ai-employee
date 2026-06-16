# Issues — enforce-execution-delivery-phases

## [2026-06-16] Known Issues / Gotchas

### Generator Failure Vectors (3)

1. Prompt JSON example shows `"delivery_steps": null` — biases model to null
2. `delivery_instructions` told to MIRROR `delivery_steps` — if steps null, instructions null too
3. `applyCreateAllowlist` passes null through; blank-guard never fires on CREATE (baseline null)

### Data Safety

- google-workspace-assistant has DIFFERENT content in delivery_steps vs delivery_instructions
- delivery_steps = 'Post the task results to the configured Slack channel.' (short)
- delivery_instructions = long VLRE_GOOGLE_ASSISTANT_DELIVERY_INSTRUCTIONS
- MUST use COALESCE — never blind copy

### Approval Ordering

- Already correct — delivery only spawns after handleApprove
- No reordering needed

### deliverable_type Double Duty

- Gates the no-approval delivery DECISION (moving to resolver)
- Also used for Slack card UX at approval-handler.ts:454/490 (KEEP THIS)

### Pre-existing Test Failures (do not fix)

- container-boot.test.ts — requires Docker socket
- inngest-serve.test.ts — function count mismatch
