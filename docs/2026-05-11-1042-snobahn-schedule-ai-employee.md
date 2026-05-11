# SNÖBAHN Daily Schedule AI Employee — Archetype Proposal

> **For review by**: Harry Carrothers, SNÖBAHN  
> **Prepared by**: Victor Dozal  
> **Date**: May 11, 2026  
> **Status**: Draft — pending your feedback before implementation begins

---

## What Problem This Solves

Every day, a manager at each location spends the majority of their pre-opening time manually building a schedule spreadsheet — taking the day's booked lessons from the booking app and arranging them into a slope-by-slope, time-slot-by-time-slot grid, with instructor assignments and athlete details filled in.

This AI employee does that work automatically, so the schedule is ready when the team arrives.

---

## What the AI Employee Does

Every morning at **2:00am**, the AI wakes up and runs the following process for the assigned location:

1. **Reads the employee schedule** — which staff are working today, their positions, and their shift start/end times. This comes from the weekly schedule file you upload to a Slack channel at the start of each week.

2. **Reads the day's bookings** — pulls all booked lessons for the day directly from the SNÖBAHN booking system (names, ages, ability levels, lesson types, disciplines, requested instructors).

3. **Builds the schedule** — places each booked athlete into the right slope column and time slot, assigns an instructor, and groups athletes following the existing age and ability compatibility rules (the same rules the booking system already enforces).

4. **Generates an Excel file** — formatted to match your current daily schedule template, with:
   - Slope columns × 30-minute time slot rows
   - Each slot showing: Lesson Type, Instructor, and for each athlete: Name, Age, Ability Level
   - **Credit count next to each athlete name** (e.g., "Alex Johnson — 2 credits") so staff can immediately spot upsell opportunities
   - Private lessons clearly marked as locked/blocked
   - Wristband kick-out colors per time slot

5. **Posts the file to Slack** — the generated Excel is posted to your designated Slack channel by ~2:30am, ready for the team when they arrive.

---

## Inputs

| Input                  | Format                                                 | Frequency         | Provided By              |
| ---------------------- | ------------------------------------------------------ | ----------------- | ------------------------ |
| Employee work schedule | Excel or CSV file (same format as your current export) | Once per week     | Manager uploads to Slack |
| Today's booked lessons | Pulled automatically from SNÖBAHN booking system       | Every run (daily) | AI reads directly        |

---

## Output

An Excel file, one per day per location, with:

- **One tab**: The full daily schedule grid
- **Columns**: One per slope (e.g., Slope 1 through Slope 4 for Thornton)
- **Rows**: One per 30-minute time slot, for the full operating day
- **Each cell**: Lesson type, instructor name, and each athlete's name + age + ability level + credit count
- **File name**: e.g., `Thornton-Schedule-2026-05-11.xlsx`

---

## What the AI Will NOT Do (MVP)

To keep the first version focused and reliable, the following are excluded:

| Excluded Feature                                     | Why                                                   |
| ---------------------------------------------------- | ----------------------------------------------------- |
| Break scheduling (30-min / 15-min staff breaks)      | Takes very little time to fill in manually            |
| Freestyle / trampoline / skate scheduling            | Different rules, separate area — phase 2              |
| Commission and 4-pack sales tracking                 | End-of-day manager input, too variable for automation |
| Instructor lesson count totals                       | Can be derived from the generated schedule manually   |
| "Instructor view" (schedule filtered per instructor) | Valuable future feature — not in MVP                  |

---

## Scheduling Rules the AI Will Follow

These are the rules derived from your existing schedule templates, the booking system, and our call. Please review each one and flag anything that needs to be corrected.

### 1. Athlete Grouping — Ability Levels

Athletes are placed in lessons with other athletes at compatible ability levels. The AI will use the same compatibility rules already enforced by the booking system:

- **Ski**: Level 1s only with Level 1s. Level 3–4 together. Level 5 can go with 4–6. And so on.
- **Snowboard**: Similar tiered groupings.
- **Never** mix incompatible levels in a group lesson.

### 2. Athlete Grouping — Age

Athletes must also be within compatible age ranges. Examples:

- A 4-year-old skier can only be with other 4-year-olds (max 1 per lesson)
- 8–10 year-olds can be grouped together (max 3 per lesson)
- Minimum age for snowboarding: **6 years old**

### 3. Group Size Limits

- **Slope capacity**: Maximum 3 athletes per slope per 30-minute slot
- **Private lessons**: Exactly 1 athlete. These slots are flagged as **locked** — the AI will not attempt to add any other athlete to a private lesson, and will mark them visually as "do not add."
- **Intro lessons**: Same capacity as group (up to 3), but only for first-time-at-SNÖBAHN athletes (or athletes coming from a higher mountain level)

### 4. Instructor Assignment

- **Preferred**: Staff with position **Instructor**
- **Last resort**: Staff with position **Floor Manager** (only if no instructors are available for that time slot)
- **Never assigned**: Managers, Training Managers, Freestyle staff
- **Shift constraints**: An instructor is only assigned to slots within their shift window (e.g., a 3:45pm–8:45pm instructor doesn't get a noon slot)
- **Discipline matching**: The AI will reference the ITA (Instructor Technical Assessment) list to avoid assigning a ski-only instructor to a snowboard lesson

### 5. Requested Instructors

When an athlete's booking note says `"req [LastName]"`, the AI will place them on the same slope and time slot as that instructor, and will prioritize keeping that assignment intact.

### 6. Slope Column Assignment (Visual Readability)

The physical slope number in the booking system doesn't need to match the column in the schedule. The AI will arrange lessons into columns to maximize readability — specifically, keeping the same instructor's lessons in the same visual column throughout the day when possible.

### 7. Credit Count Display

Each athlete's name in the schedule will include their remaining credit count. This replaces the current color-coding (which can't be used in calculations). Example:

```
Alex Johnson — 2 credits
```

Staff can scan the schedule to identify athletes who are running low (1–2 credits) for upsell conversations.

### 8. Wristband Colors

Each time slot row will include the correct wristband color (Purple, Yellow, Red, Blue, Pink, Green — cycling in that order by 30-minute intervals, starting at opening time). Same as your current Wristband Color reference tab.

### 9. Blocked / Blackout Hours

If a slope has a blackout hour configured in the booking system for that day, the corresponding time slot in the schedule will appear as "BLOCKED."

---

## What We Need From You to Make This Work

1. **Confirm the employee schedule format** — Is the schedule always exported from the same tool in the same Excel format? Or does it sometimes come as a CSV, or a different layout?

2. **Confirm the instructor discipline list** — The ITA tab in your Q2 schedule lists which instructors can teach Ski, Snowboard, or Both. Is this list up to date? Should the AI use this as its reference, or is there a more authoritative source?

3. **Confirm the Slack channel** — Which Slack channel should the AI post the generated schedule to? One channel for Thornton, one for Centennial?

4. **Confirm operating hours** — Are the hours in the booking system accurate for each slope, each day of week? Or are there exceptions the system doesn't know about?

5. **Edge case: no instructors available** — If there are more booked lessons than available instructors for a time slot, what should the AI do? Options:
   - Leave the instructor field blank and flag it
   - Use a Floor Manager
   - Alert the manager via Slack

6. **Edge case: walk-in athletes** — The AI generates the schedule based on pre-booked lessons only. Walk-ins that are added during the day are not in scope — the manager handles those manually on the printed/digital schedule. Is that acceptable?

---

## Questions About the Future (Not MVP, Just Worth Discussing)

- **Instructor view**: Harry mentioned wanting a way for each instructor to see only their lessons. This is possible in a future version — one tab per instructor, or a separate file.
- **Low-credit email alerts**: Harry mentioned wanting to automatically email athletes who are low on credits. This could be a separate AI employee that runs alongside the schedule generator.
- **Real-time updates**: Right now this is a once-daily run at 2am. If a new booking comes in at 7am, the schedule won't reflect it. A future version could regenerate on-demand when triggered.

---

## Proposed Implementation Path

If you approve this proposal, here's the sequence:

1. **Phase 1** — Build and test with sample data (offline, no live SNÖBAHN DB access)
2. **Phase 2** — Connect to SNÖBAHN production DB (read-only) and run against real bookings
3. **Phase 3** — Run in parallel with your manual process for 1 week — compare outputs
4. **Phase 4** — Hand off: AI generates the schedule, manager reviews once before the day starts

Total estimated time to Phase 3: **2–3 weeks** depending on feedback cycles.

---

## Summary

|                            |                                                                       |
| -------------------------- | --------------------------------------------------------------------- |
| **Employee name**          | SNÖBAHN Daily Schedule Generator                                      |
| **Locations**              | One instance per location (Centennial, Thornton)                      |
| **Trigger**                | Daily cron at 2:00am Mountain Time                                    |
| **Runtime**                | ~30 minutes (2:00am → ~2:30am delivery)                               |
| **Inputs**                 | Weekly employee schedule (Slack upload) + daily bookings (SNÖBAHN DB) |
| **Output**                 | Excel file posted to Slack                                            |
| **Approval required**      | No — file posted immediately, manager adjusts if needed               |
| **Credits model**          | Standard AI employee platform (OpenRouter / MiniMax M2.7)             |
| **Estimated time savings** | 80–90% of current daily schedule preparation time                     |

---

_Please review the scheduling rules above and let Victor know if anything is incorrect or missing. Once you confirm, we'll begin implementation._
