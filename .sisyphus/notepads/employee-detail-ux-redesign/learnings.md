## Task 5 — Settings Edit Mode Redesign (2026-05-19)

### Interface/type changes

- `PatchData`: Removed `model` and `runtime` from `Pick<Archetype, ...>` — these are developer-managed fields that should not be mutable from the dashboard.
- `EditValues`: Stripped to user-editable fields only: `role_name`, `instructions`, `system_prompt`, `notification_channel`, `concurrency_limit`, `approval_required: boolean`, `timeout_hours: number`.
- `archetypeToEditValues`: Reads structured `risk_model` directly: `a.risk_model?.approval_required ?? false` and `a.risk_model?.timeout_hours ?? 0`.
- `risk_model` type in `types.ts` is `{ approval_required: boolean; timeout_hours?: number } | null` — no casting needed, TypeScript resolves optional chaining cleanly.

### handleSave pattern for structured risk_model

Compare existing values against edits; only include `risk_model` patch when either field changed:

```ts
const existingApproval = archetype.risk_model?.approval_required ?? false;
const existingTimeout = archetype.risk_model?.timeout_hours ?? 0;
if (
  editValues.approval_required !== existingApproval ||
  editValues.timeout_hours !== existingTimeout
) {
  changes.risk_model = {
    approval_required: editValues.approval_required,
    timeout_hours: editValues.timeout_hours,
  };
}
```

This is cleaner than JSON.stringify comparison and type-safe.

### set() function widened to boolean

Changed signature from `(value: string | number)` to `(value: string | number | boolean)` — necessary to use `set('approval_required')` as the `onCheckedChange` handler for Switch, which passes `checked: boolean`.

### Switch in edit mode (interactive, not disabled)

```tsx
<Switch
  checked={editValues.approval_required}
  onCheckedChange={(checked) => set('approval_required')(checked)}
  aria-label="Approval required"
/>
```

`disabled` is NOT set — switch is fully interactive in edit mode.

### Dual Save/Cancel pattern

Used a `SaveCancelBar` inner component (defined inside `ConfigTab` above the `return`) to avoid repeating the JSX. Renders at top and bottom of the form.

### Collapsible Advanced section in edit mode

System Prompt moved into `<Accordion type="single" collapsible>` with `value="advanced"`. Collapsed by default (no `defaultValue`). Same pattern as Technical Details in view mode.

### textareaClass removed

The raw `risk_model_json` textarea is gone; `textareaClass` string constant was removed since nothing references it.

### Edit form field order

Role Name → Task Instructions (MarkdownEditorField) → 2-col grid (Approval Required, Max Duration, Slack Channel, Simultaneous Tasks) → Inputs section → Advanced accordion (System Prompt) → Save/Cancel at bottom.

### Build result

`pnpm build` exits 0 — no errors introduced by this task.
