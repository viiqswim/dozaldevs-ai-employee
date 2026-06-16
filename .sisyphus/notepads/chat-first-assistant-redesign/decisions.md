# Decisions — chat-first-assistant-redesign

## [2026-06-14] Session Start

### Shared helpers location

- `src/gateway/lib/archetype-edit-helpers.ts` — new file for `mapArchetypeRowToConfig` + `validateProposalFields`

### Types location

- Gateway: `ConverseMessage` + `ConverseResult` in `src/gateway/services/archetype-generator.ts` or a co-located types file
- Dashboard: `ConverseMessage` + `ConverseResponse` in `dashboard/src/lib/types.ts`

### Hook location

- `dashboard/src/panels/employees/use-chat-conversation.ts`

### Wave execution order

- Wave 1: T1, T2, T3, T4 (all parallel)
- Wave 2: T5, T6, T7 (after Wave 1)
- Wave 3: T8, T9, T10, T11, T12 (after Wave 2, some parallel)
- Wave 4: T13, T14 (after Wave 3)
- Final: F1-F5 (parallel)
