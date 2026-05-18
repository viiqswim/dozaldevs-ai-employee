# Learnings — review-config-ux

## [2026-05-18] Session Start

- Dashboard: React 19 + Tailwind 4 + shadcn/ui, Vite, pnpm
- Card component at `dashboard/src/components/ui/card.tsx` — has `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`. CardContent defaults to `p-6 pt-0` — OVERRIDE with `className="p-4 pt-0"`
- CreateEmployeePreview.tsx is 442 lines — the full return statement needs restructuring
- The approval toggle is a custom `<button role="switch">` — NOT shadcn Switch — keep as-is
- Tools section is CONDITIONAL on `config.tool_registry?.tools?.length > 0` — card must stay conditional
- Action bar is in PARENT `CreateEmployeePage.tsx` lines 210-227, not in preview component
- Dashboard dev server runs at localhost:5173 (vite default)
- Build command: `cd dashboard && pnpm build`

## [2026-05-18] CreateEmployeePreview Card Restructuring

- Completed Wave 1: pure JSX restructuring of CreateEmployeePreview.tsx (442→449 lines)
- 6 Card sections: Employee Name, What it Does, Trigger, Settings, Tools (conditional), Advanced
- CardContent default is `p-6 pt-0` — override to `className="p-4 pt-0"` on all cards in this component
- Card D "Settings" merges 3 formerly-separate sections — JSX reorder required: Max Concurrent Tasks was AFTER Tools in original, moved into Settings Card which comes BEFORE Tools
- Card F "Advanced" has NO CardHeader — the collapsible `<button>` IS the visual header; use `<CardContent className="p-4">` (no `pt-0` since there's no header)
- "What it Does" CardContent needs `max-h-64 overflow-y-auto` to prevent instructions dominating
- Outer wrapper `space-y-4` → `space-y-5` for slightly more breathing room between cards
- Advanced toggle button upgraded from `text-xs` to `text-sm` for better readability
- Section labels changed from `<label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">` to `<p className="text-sm font-medium">` inside Settings Card subsections
- Build passes clean: `tsc -b && vite build` EXIT_CODE:0

## [2026-05-18] Task 3 — Visual QA Results (Wave 1 verification)

### Environment
- Dashboard at localhost:5174 (5173 taken by FloodSmart Control Hub from another project)
- Gateway at localhost:7700 ✅
- Admin API Key modal appears on first load — must fill `ADMIN_API_KEY` and click Save before Generate works
- Playwright: used `chromium-1223` from `~/Library/Caches/ms-playwright/` with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`

### Build Verification
- `pnpm build` in `dashboard/`: EXIT_CODE:0 ✅
- TypeScript clean, Vite build 477ms, 2143 modules transformed
- Evidence: `.sisyphus/evidence/task-3-build-output.txt`

### Page Navigation
- Heading: "AI Employee Dashboard" ✅
- Textarea present: ✅

### Preview Generation
- Generate API call: ~10-30s for response ✅
- "Employee Name" text appeared after click ✅

### Card Structure (Step 4)
- `data-slot="card"` selector: 0 (shadcn Card doesn't use this attribute in this version)
- `.rounded-xl.border` + `.rounded-lg.border`: 6 cards ✅ (>= 5 required)
- All 5 mandatory card titles found: Employee Name, What it Does, Trigger, Settings, Advanced ✅
- Tools card: conditional, not present (generated archetype had no tools) — expected behavior ✅

### Trigger Type Switching (Step 5)
- Scheduled → cron input/text visible: ✅
- Manual → code block visible: ✅
- Webhook → event type input: clicked ✅

### Settings Toggle (Step 6)
- `button[role="switch"]` found: 1 ✅
- aria-checked changed: "true" → "false" ✅
- Restore works ✅

### Advanced Section (Step 7)
- Button selector: `button:has-text("Advanced")` (NOT `/^advanced$/i` — has triangle prefix ▶/▼)
- Button text when collapsed: `"▶Advanced"`
- "Employee Brain" visible after expand: ✅
- "Trigger Instructions" visible after expand: ✅
- Button text after expand: `"▼Advanced"` ✅ (toggles correctly)
- Collapse restores `"▶Advanced"` ✅

### Action Bar (Step 8)
- "Create Employee" button: ✅
- "Back" button: ✅
- `border-t` class found on action bar div: `"border-t pt-4"` ✅
- Computed border-top: `1px` on `"flex justify-end gap-2 border-t pt-4 mt-2"` ✅
- Task 2 change (`pt-2` → `border-t pt-4 mt-2`) verified ✅

### Narrow Viewport (Step 9)
- 768px width: scrollWidth=768, clientWidth=768 ✅
- No horizontal overflow ✅

### Evidence Files
- `task-3-build-output.txt` ✅
- `task-3-idle-state.png` ✅ (after API key modal dismissed)
- `task-3-preview-loaded.png` ✅
- `task-3-trigger-switching.png` ✅
- `task-3-settings-card.png` ✅
- `task-3-advanced-open.png` ✅ (Employee Brain + Trigger Instructions visible)
- `task-3-action-bar.png` ✅
- `task-3-narrow-viewport.png` ✅
- `task-3-qa-results.txt` ✅ (full log)

### Known Gotchas
- `data-slot="card"` attribute NOT used by shadcn Card in this project — use `.rounded-xl.border` or `[class*="rounded"][class*="border"]` instead
- Advanced button selector must use `:has-text("Advanced")` not `/^advanced$/i` due to ▶/▼ prefix
- Admin API Key modal blocks Generate button click — must be dismissed first
- Dashboard port is NOT guaranteed to be 5173 when other Vite apps are running

### OVERALL: ALL CHECKS PASSED ✅
