# Learnings — employee-profile-ui-redesign

## Project Conventions

- Dashboard is in `dashboard/src/`
- Build command: `pnpm dashboard:build` from repo root
- Dev URL: http://localhost:7701/dashboard/
- TypeScript strict mode — no `any`, no `@ts-ignore`
- Radix UI primitives via `@/components/ui/`
- `SearchableSelect` MUST be used for all dropdowns (not Radix `Select`)
- Toast via `sonner` — `toast.success()`, `toast.error()`, `toast.info()`
- `patchArchetype(tenantId, archetypeId, changes)` from `@/lib/gateway` for saving
- `fetchBrainPreview(tenantId, archetypeId)` from `@/lib/gateway` for preview data
- `usePoll` hook for polling PostgREST data
- `postgrestFetch` for direct DB reads

## Key Files

- `dashboard/src/panels/employees/EmployeeDetail.tsx` — 4-tab detail (to be rewritten in T6)
- `dashboard/src/panels/employees/BrainPreviewTab.tsx` — brain preview (reference for API call pattern)
- `dashboard/src/panels/employees/TrainingTab.tsx` — training rules (embed in T8)
- `dashboard/src/components/MarkdownEditorField.tsx` — CodeMirror markdown editor
- `dashboard/src/components/MarkdownPreview.tsx` — read-only markdown renderer
- `dashboard/src/lib/types.ts` — Archetype, BrainPreviewResponse, etc.
- `dashboard/src/lib/gateway.ts` — API calls
- `dashboard/src/App.tsx` — routing

## Approved LLM Models (CRITICAL)

- `minimax/minimax-m2.7` — primary
- `anthropic/claude-haiku-4-5` — verification only
- ANY other model reference is a bug

## Soft Delete Rule

- Never hard delete — use `deleted_at` timestamp

## Wave Execution Plan

- Wave 1: T1 first (foundation), then T2+T3 in parallel
- Wave 2: T4 first, then T5, then T6 (sequential chain)
- Wave 3: T7+T8 in parallel, then T9
- Final: F1-F4 in parallel

## [2026-05-20] Task: T1

- `dashboard/src/panels/employees/components/` dir created (didn't exist before T1)
- AccordionTrigger ships with its own ChevronDown via `[&>svg]` — suppress it with `[&>svg]:hidden` then add our own ChevronDown with `group-data-[state=open]:rotate-180`
- `subtitle` prop on CollapsibleSection renders below title, same text-left column
- InlineEditableMarkdown checks `value?.trim()` (not just `value`) for empty-state guard
- pnpm dashboard:build takes ~30s; run in tmux and poll
