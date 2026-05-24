# Decisions — instruction-pipeline-reliability

## [2026-05-24] Architectural Decisions

### Decision: Keep §5 and §6 as safety rails

Both sections prevent agents from modifying platform code and accessing DB directly. Non-negotiable.

### Decision: closingSections as 7th parameter (not modifying existing layers)

Keeps resolver's pure concatenation role. New parameter is optional — backward compatible.

### Decision: Approval-aware closing section

`closingClassification = approvalRequired ? 'NEEDS_APPROVAL' : 'NO_ACTION_NEEDED'`
Prevents confusing cheap models with wrong classification in the final reminder.

### Decision: Error handling absorbed into platform-procedures.mts

Both branches (approvalRequired true/false) get the error handling paragraph.
This removes the need for §8 in agents.md.
