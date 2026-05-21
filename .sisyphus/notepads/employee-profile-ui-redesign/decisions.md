# Decisions — employee-profile-ui-redesign

## [2026-05-21] Plan Design Decisions

- Section-level save model: each section saves independently via patchArchetype
- Draft employees: show in `mode="edit"` by default on detail page
- Active employees: show in `mode="view"`, Edit buttons per section
- URL `/employees/:id/edit` redirects to detail page (handles draft mode)
- Create flow: AI generation → navigate to detail page (draft mode)
- Technical fields (model, runtime, VM): hidden in "Advanced" accordion, never deleted
- Activity: limit 5 tasks (not 10), "View all" link when 5 shown
- Preview: NO raw/rendered toggle — user-friendly rendered view only
- Wave 1: Run T1 first (creates shared components), then T2+T3 in parallel
