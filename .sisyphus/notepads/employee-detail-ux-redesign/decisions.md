# Decisions — employee-detail-ux-redesign

## [2026-05-19] Design decisions from user interview

- Developer fields (model, runtime, vm_size, deliverable_type): read-only in collapsed "Technical Details" section
- Brain Preview: keep ALL info but split into human-readable and technical debug sections
- Rules tab: full interactive CRUD including new backend API
- Recent Tasks: metadata cards (no summary field in DB), with expandable status timeline
- Edit mode: full-page edit toggle; developer fields stay read-only even in edit mode
- Tab renaming: Config→Settings, Recent Tasks→Activity, Rules→Training, Brain Preview→Knowledge
- Employee title: keep slug as-is
- Test strategy: Playwright QA only
- Training tab scope: full CRUD with backend work included
- Task card content: metadata cards — no summary text
