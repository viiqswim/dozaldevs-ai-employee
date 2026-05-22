# Google Stitch UI Redesign Prompt

AI Employee Platform dashboard — copy-paste prompts for Google Stitch.

**How to use:**

1. Go to [stitch.withgoogle.com](https://stitch.withgoogle.com)
2. Paste the **Initial Prompt** first — this sets the design language for the entire app
3. After generation, prompt: `"Generate the DESIGN.md for this brand and place it on the canvas"` — this locks tokens for consistency
4. Iterate with targeted follow-ups (see Tips at the bottom)
5. Add screens one at a time using the per-screen prompts below

---

## Initial Prompt

Paste this first. Sets the overall layout, visual system, and generates the Task Feed (home screen).

```
Design a responsive web dashboard for an AI Employee management platform. This is an internal operations tool used by non-technical property managers and small business owners to monitor and manage autonomous AI agents ("employees") that perform tasks like replying to guest messages, summarizing Slack channels, and rotating lock codes.

Platform: Desktop-first responsive web app.
Target user: Non-technical business operators who manage a team of AI agents. They need clear status at a glance, quick access to pending approvals, and confidence that their AI employees are working correctly.

Visual Style:
- Clean, modern SaaS dashboard aesthetic (think Linear, Vercel Dashboard, Retool)
- Light mode with a neutral palette — whites, light grays, subtle borders
- Minimal color usage reserved for status indicators: green for success/active, amber for warning/pending, red for error/failed, blue for informational
- Compact data density — this is a monitoring tool, information-rich without clutter
- Rounded corners (8px), subtle shadows, generous but not excessive whitespace
- Inter or similar system font, monospace for IDs and technical values
- Status badges as small colored pills with text

Global Layout:
- Fixed left sidebar (220px) with navigation: Tasks, Employees, Tenants, Rules, Tools, Preflight. Each item has a Lucide icon. The Preflight item has a small colored health dot (green/red/pulsing) next to it.
- Top header bar with: app title "AI Employee Dashboard", a small health status chip linking to Preflight (shows "All systems OK" in green or "2 down" in red), a tenant selector dropdown on the right, and a settings gear icon.
- Main content area scrollable below the header.

Screen: Task Feed (the home/default view)
Purpose: Show a live feed of all AI employee task executions so the operator can monitor what's happening, spot failures, and click into details.

Content:
- Filter bar at top with 4 controls in a horizontal row: Status dropdown (options: All Statuses, Received, Triaging, Ready, Executing, Submitting, Reviewing, Approved, Done, Failed, Cancelled), Employee dropdown (populated dynamically), Date From picker, Date To picker.
- Below filters: a subtle "Showing 47 tasks" count.
- Data table with 6 columns: Status (colored badge pill), Employee (monospace text), Source, Created (relative time like "3m ago"), Duration (like "2m 14s"), Cost (like "$0.0032").
- Table rows are clickable with a subtle hover highlight.
- Empty state: centered text "No tasks found" with a link "Trigger a task".
- Skeleton loading state: pulsing gray rectangles in each cell while data loads.

Design constraints:
- No decorative illustrations or icons beyond Lucide line icons
- Accessible text sizing (14px body, 12px labels/captions)
- All dropdowns should use a combobox pattern with built-in search
- Table should have sticky header
```

---

## Screen: Employee List

```
Generate the Employees list screen. Same layout and design language.

Content:
- Page title "Employees" with a "+ New Employee" button on the right.
- Search input and a status filter dropdown (All, Active, Draft, Deleted) side by side.
- Bulk selection toolbar that appears when checkboxes are selected: "3 selected" text, "Delete Selected" red button, "Clear selection" ghost button.
- Data table with columns: Checkbox, Employee name, Model (monospace small text), Runtime, Status (green "Active" or gray "Draft" pill badge), Approval ("Required" amber badge or "Auto" green badge), Concurrency (number), Actions (Trigger, Dry Run, Delete buttons — small, outlined).
- Each row is clickable. Deleted employees show a "Restore" button instead of the normal actions.
```

---

## Screen: Task Detail

```
Generate the Task Detail screen. Same design language. Single column, max-width 768px, centered.

Content sections stacked vertically, each in a bordered card:
1. Header card: Employee name (large), truncated task ID (monospace, small), status badge. If Failed, show a red-bordered callout below with an alert icon and failure reason text.
2. Status Timeline card: Horizontal timeline showing state transitions (Received → Ready → Executing → Submitting → Reviewing → Done) with timestamps. Completed states are solid dots, current state is highlighted, future states are hollow.
3. Approval card (conditional): "Approve" green button and "Reject" red button side by side. Only visible when status is Reviewing.
4. Execution Metrics card: 4 stat tiles in a row — Status (badge), Tokens (number), Cost (dollar amount), Duration (time string). Each tile is a small centered box with value on top and label below.
5. Deliverable card: Shows delivery type badge, then a code block with JSON content (pretty-printed).
6. Feedback Events card: List of events, each as a small row with a colored type badge (teaching=purple, feedback=blue, rejection=red), actor ID in monospace, and relative timestamp.
```

---

## Screen: Employee Detail

```
Generate the Employee Detail screen. Same design language.

Content:
- Breadcrumb: "← Employees" link, then employee name (large heading).
- Action buttons row on the right: Trigger (outline), Dry Run (outline), Delete (red).
- Tab bar below header with 4 tabs: Profile, Activity, Training, Advanced.

Profile tab content (default):
- "Assignment" card: Role name display, large text area for trigger prompt/instructions, Slack channel selector.
- "Personality" card: Employee overview text, and a markdown editor for the "employee brain" (agents_md).
- "Settings" card: 2x2 grid of small fields — Approval Required toggle, Concurrency Limit number, Model selector, Runtime display.

Training tab content:
- "Add Rule" button at top right.
- List of rule cards, each showing: status badge (green "Active", blue "Needs Review", red "Rejected"), rule text, timestamp. For rules needing review: Approve (green outline) and Reject (red outline) buttons. For active rules: Edit and Delete icon buttons.
- Empty state: dashed border box with text "No training rules yet. As this employee works and you provide feedback in Slack, it will learn rules automatically."
```

---

## Screen: Create Employee

```
Generate the Create Employee screen. Same design language. Centered single column, max-width 640px.

Content:
- Breadcrumb: "← Employees" link, title "Create New Employee".
- Instructional text: "Describe what you want your AI employee to do. Be specific about its tasks, schedule, and any tools it should use."
- Large textarea (160px height, full width) with placeholder: "e.g., An employee that reads our #support Slack channel every morning and sends a summary..."
- Character count "0/2000" bottom-left.
- Slack Channel label with a searchable dropdown selector for channel selection.
- "Generate" button bottom-right (disabled until 10+ chars and channel selected).
- When generating: centered spinner with text "Analyzing your description and generating a complete employee configuration…"
```

---

## Screen: Tenant Settings

```
Generate the Tenant Settings screen. Same design language. Single column, max-width 768px.

Content:
- "Tenant" card at top showing read-only details in a key-value layout: Name, Slug, Status, ID, Created.
- Tab bar below with 4 tabs: Config, Secrets, Archetypes, Integrations.

Secrets tab (most important):
- List of secrets, each row showing: key name in monospace, a green "Set" badge or red "Not set" badge, and a "Set value" outline button.
- When editing: inline password input with Save and Cancel buttons.

Integrations tab:
- Integration cards (Slack, Jira) each in a bordered card showing: service name, description, Connected status (green badge) or "Connect" outline button linking to OAuth flow.
```

---

## Screen: Preflight Check

```
Generate the Preflight Check screen. Same design language.

Content:
- Header with title "Preflight Check", subtitle "Last checked: 3s ago", and "Refresh All" button.
- 2-column grid of service health cards. Each card shows: service name (bold), optional note text (small gray), status badge ("Online" in green or "Offline" in red), response time in ms (small gray text). When a service is down, show the error message in small red text below the badge.
```

---

## Tips for Iterating in Stitch

- **After the first generation**, prompt: `"Generate the DESIGN.md for this brand and place it on the canvas"` — locks color/typography tokens for all subsequent screens
- **Use targeted follow-ups** rather than regenerating from scratch:
  - `"Make the sidebar more compact — reduce padding and use 13px font"`
  - `"The status badges should be smaller pills, not full-width tags"`
  - `"Add more vertical spacing between the filter bar and the table"`
  - `"Show me a dark mode version of this"`
  - `"The table feels too dense — add 4px more row height and a slightly lighter row separator"`
- **One screen per prompt** produces much better results than requesting multiple screens at once
- **Lock the design language** on the first screen before generating others — use DESIGN.md as the shared source of truth
- **Iterate 3–5 times** per screen — the first output is a starting point, not a final design
