# SNÖBAHN Daily Schedule — Inferred Rules & Evidence

> **Purpose**: Documents every scheduling rule extracted during research, with the specific source (file, database table, code, or transcript) that produced it. Intended for internal reference and for review with Harry Carrothers before implementation.

---

## How the Research Was Conducted

Four sources were analyzed:

| Source                                                                         | What It Is                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Schedule for May 4–10, 2026.xlsx`                                             | Weekly employee work schedule — two sheets: "Hourly Summary" (who works which days) and "Schedules Summary" (exact shift start/end times per day per person)                                                                          |
| `Thornton Main Schedule 2026 Q2.xlsx`                                          | The actual daily slope schedule output — the spreadsheet Harry's team produces manually every day. Contains a tab per day, plus reference tabs (ITA, Wristband Color, Levels & Ages, Intro Codes, Weekday Template, Weekend Template) |
| SNÖBAHN production database (`d8ovlei3rsa0sk` on Heroku PostgreSQL)            | The live booking application database — slopes, lessons, athletes, events, abilities, disciplines, lesson types, credits                                                                                                              |
| Harry Carrothers call transcript (`2026_05_06 16_01 CDT - Notes by Gemini.md`) | 16-minute planning call between Harry and Victor — Harry explains the current manual process, constraints, and MVP priorities                                                                                                         |

---

## Rule 1 — Locations & Slope Count

**Rule**: There are two SNÖBAHN locations. Each has a different number of slopes.

| Location   | Slopes               | Slope Capacity  | Lesson Length |
| ---------- | -------------------- | --------------- | ------------- |
| Centennial | 3 (Slope 1, 2, 3)    | 3 athletes each | 30 min        |
| Thornton   | 4 (Slope 1, 2, 3, 4) | 3 athletes each | 30 min        |

Both locations also have a Skate Lessons slope (60-min slots, larger capacity).

**Evidence**:

- **Production DB — `slopes` table**: Direct query returned 9 slopes across 2 locations:
  ```
  id=5,6,7  → Centennial, lesson_length=30, capacity=3
  id=14,15,16,17 → Thornton, lesson_length=30, capacity=3
  id=8 → Centennial Skate, lesson_length=60, capacity=5
  id=18 → Thornton Skate, lesson_length=60, capacity=8
  ```
- **Production DB — `locations` table**: `id=1 Centennial`, `id=2 Thornton`
- **Thornton Main Schedule Q2.xlsx — Weekday Template sheet**: Column headers confirm Slope 1, Slope 2, Slope 3, Slope 4 across the grid (columns B, G, L, Q, V in the template)

---

## Rule 2 — Schedule Grid Structure (Time × Slope)

**Rule**: The daily schedule is a grid where rows are 30-minute time slots and columns are slopes. Lessons run on the half-hour (e.g., 12:00, 12:30, 1:00, ...). Each time slot on each slope shows:

- **Header row**: Time, Lesson Type, "Blocked" status, Instructor name
- **Detail rows**: Athlete name, Age, Ability level, Notes

The schedule also has side columns (to the right of the slopes) for: 15-min breaks, 30-min breaks, Freestyle, Kick Out Times (wristband colors), and Shift Details — but these are **out of MVP scope**.

**Evidence**:

- **Thornton Main Schedule Q2.xlsx — Weekday Template sheet, Row 5**: Column headers — `A=Time`, `B=Slope 1`, `G=Slope 2`, `L=Slope 3`, `Q=Slope 4`, `V=SKI VALET`, `W=Break`, `X=Break`, `Y=Freestyle`, `Z=Freestyle`, `AA=Freestyle`, `AB=MOFloor`
- **Weekday Template, Row 6**: Sub-headers — `B=Name, C=Age, D=Ability, E=Notes` (repeated for each slope)
- **Weekday Template, Row 7**: First time slot starts at `12:00`, next at `12:30` (Row 11), then `13:00` (Row 15) — confirming 30-minute intervals
- **Harry call transcript, 00:05:52**: _"column A is like wristband time. So, it just kind of helps us enforce that. And then column AC is other lessons."_
- **Harry call transcript, 00:07:11**: _"for the purposes of let's just call it the MVP of this AI employee, if we can figure out what's on rows A through T, that's a big win"_ — confirming the right-side columns (breaks, freestyle, commission) are out of scope

---

## Rule 3 — Disciplines

**Rule**: SNÖBAHN teaches three disciplines. Lesson types, ability levels, and age groupings are separate per discipline.

| Discipline | ID  |
| ---------- | --- |
| Ski        | 3   |
| Snowboard  | 4   |
| Skateboard | 5   |

**Evidence**:

- **Production DB — `disciplines` table**: Direct query returned `id=3 Ski`, `id=4 Snowboard`, `id=5 Skateboard`
- **Thornton Main Schedule Q2.xlsx — Levels & Ages sheet**: Has separate sections for "Ski", "Board", and "Skateboard" with distinct age and ability matrices for each

---

## Rule 4 — Ability Levels & Grouping (Critical Rule)

**Rule**: Athletes have an ability level (1–7) per discipline. Only compatible ability levels may be grouped in the same lesson. The compatibility matrix is:

**Ski Ability Groupings:**

| Level                | Description                                                | Can Group With                  |
| -------------------- | ---------------------------------------------------------- | ------------------------------- |
| Intro A/B            | New to SNÖBAHN (mountain lvls 1–4 = Intro A; 5+ = Intro B) | Other Intro A or Intro B (same) |
| 1 (Beginner)         | Never skied, can't maintain gliding wedge                  | Level 1                         |
| 2 (Gliding Wedge)    | Maintains gliding wedge, stops with wedge                  | Level 2                         |
| 3 (Wedge Turns)      | Wedge turns to both sides                                  | Levels 3–4                      |
| 4 (Wedge Christie)   | Reducing wedge, matching inside ski                        | Levels 3–5                      |
| 5 (Basic Parallel)   | Consistent basic parallel turns                            | Levels 4–6                      |
| 6 (Refined Parallel) | Earlier edge engagement, progressive edging                | Levels 5–7                      |
| 7+                   | Simultaneous edge release, angulation                      | Levels 6–7                      |

**Snowboard Ability Groupings:**

| Level     | Description                             | Can Group With            |
| --------- | --------------------------------------- | ------------------------- |
| Intro A/B | New to SNÖBAHN                          | Intro A or Intro B (same) |
| 1         | Never snowboarded, basic balance        | Level 1                   |
| 2         | Heel-side traverse and J-turns at bar   | Levels 2–3                |
| 3         | C-turns at upper bar                    | Levels 3–4                |
| 4         | Speed control in turns, J-turns off bar | Levels 4–5                |
| 5         | Basic S-turns off bar                   | Levels 5–7                |
| 6         | Carve turns, progressive edging         | Levels 5–7                |
| 7         | Switch turns, refined freeride          | Levels 5–7                |

**Evidence**:

- **Thornton Main Schedule Q2.xlsx — Levels & Ages sheet, Rows 3–10**: Full text descriptions of each level for both Ski and Snowboard, with explicit "GROUP WITH LEVEL X-Y" labels in each cell. For example: _"Lvl 3 Wedge Turns [GROUP WITH LEVELS 3-4]"_, _"Lvl 5 Basic Parallel [GROUP WITH LEVELES 4-6]"_
- **Production DB — `abilities` table**: `level`, `compatibility` (JSON array), and `discipline_id` fields confirm these rules are enforced in the booking system
- **App code — `Ability.php`, line 36**: `Ability::compatible()` method — validates ability compatibility before allowing an athlete to be booked into a lesson
- **App code — `Ability.php`, line 31**: `Ability::matrix()` method — builds the full compatibility matrix from the database

---

## Rule 5 — Age Grouping (Critical Rule)

**Rule**: Athletes must also be within compatible age ranges. Age matrices are separate per discipline and per ability level. Group size maximums are defined per age:

**Ski Age Groupings (from the schedule's reference tab):**

| Athlete Age | Compatible Group Ages | Max per Lesson |
| ----------- | --------------------- | -------------- |
| 4           | 4 only                | 1              |
| 5           | 5–6                   | 2              |
| 6           | 5–7                   | 2              |
| 7           | 6–10                  | 2              |
| 8–10        | 7–12                  | 3              |
| 11–12       | 9–12                  | 3              |

**Snowboard Age Groupings:**

| Athlete Age | Compatible Group Ages | Max per Lesson |
| ----------- | --------------------- | -------------- |
| 6–7         | 6–8                   | 2              |
| 8           | 7–10                  | 3              |
| 9–10        | 8–11                  | 3              |
| 11–12       | 9–12                  | 3              |

Minimum age for snowboarding: **6 years old**. No snowboard lessons below age 6.

**Evidence**:

- **Thornton Main Schedule Q2.xlsx — Levels & Ages sheet, Rows 15–37**: Full age compatibility matrices with "X" marks in grid cells showing compatible combinations. The "Amount per Lesson" column (K for ski, I for board) shows max group size per age.
- **Production DB — `abilities` table**: `compatible_ages` field on `User` model stores per-athlete age compatibility
- **App code — `Age.php` model** and **`Lesson.php` line 155**: `isAthleteCompatible()` validates both age and ability before allowing booking

---

## Rule 6 — Lesson Types & Private Lesson Rules

**Rule**: Each booked lesson has a type. The type controls how many athletes can share a slot and whether the slot is "private" (locked).

| Lesson Type                   | Private? | Intro? | Slot Limit | Rule                                     |
| ----------------------------- | -------- | ------ | ---------- | ---------------------------------------- |
| Youth/Adult Group Lesson      | No       | No     | 3          | Open to compatible athletes              |
| Youth/Adult Private Lesson    | **Yes**  | No     | 1          | **Do NOT add athletes. Highlight blue.** |
| Intro Beginner Group Lesson   | No       | Yes    | 3          | First visit to SNÖBAHN                   |
| Intro Beginner Private Lesson | **Yes**  | Yes    | 1          | First visit, private                     |
| Intro Advanced Group Lesson   | No       | Yes    | 3          | SNÖBAHN experience, advanced mountain    |
| Intro Advanced Private Lesson | **Yes**  | Yes    | 1          | SNÖBAHN experience, advanced, private    |

**Evidence**:

- **Production DB — `lesson_types` table**: `private` boolean column. All private types have `private=true` and `slots=1`
- **Harry call transcript, 00:04:41**: _"If this was a ski private, let's say, we would highlight this blue just to make it more clear like do not... not like day of throw someone in there. They paid not to be."_
- **App code — `Lesson.php` line 206**: `getIsFullAttribute()` — private lessons are always considered full: `$this->lesson_type->private`
- **Harry call transcript, 00:08:16**: _"if someone comes up to us in the middle of day like hey I want to get on and they're in front of us... if you know the first question, have you have you been here? No. Then they can only go into either an empty spot or this intro beginner or intro advanced."_ — confirms walk-in rules

---

## Rule 7 — Instructor Assignment Rules

**Rule**: Instructors are assigned to lesson slots based on who is working that day. The rules:

1. **Primary**: Use staff with position `Instructor`
2. **Last resort**: `Floor Manager` can teach but this should be minimized
3. **Never assign**: `Manager`, `Training Manager`, or `Freestyle` staff to slope lessons
4. **Requested instructor**: Some athletes have a preferred instructor. Their booking notes contain `"req [LastName]"`. Honor this — place them on the same slope/time as that instructor
5. **Discipline capability**: Instructors can be Ski-only, Snowboard-only, or Both. Don't assign a Ski-only instructor to a snowboard lesson

**Evidence**:

- **Employee Schedule Excel — Schedules Summary sheet**: Positions listed per shift: `Manager`, `Floor Manager`, `Training Manager`, `Instructor`, `Freeestyle` (sic), `Department - Not On Schedule`
- **Harry call transcript, 00:11:33 (approx)**: _"floor managers could but we want to reduce the account. We want to stay away from that but if they need to... you want to use it as a last resort."_
- **Harry call transcript, 00:11:33**: _"instructors and floor managers. That's it."_ — confirms who can be assigned
- **Thornton Main Schedule Q2.xlsx — ITA sheet, Rows 3–22**: List of instructors with their discipline capability (`D` column = "Ski", "Board", or "Both"). Examples: Andrew Huey = Ski only; Erek Brown = Both; Matthew Martino = (not listed = needs verification)
- **Thornton Main Schedule Q2.xlsx — Weekday Template, Row 6, Col D**: Each slope column has an `Instructor` field, and notes field `E` uses the `"req LastName"` convention
- **App code — `Lesson.php` line 182**: `requested_instructors()` relationship on the Lesson model — confirms this is a tracked DB relationship (`lesson_instructor_requests` pivot table)

---

## Rule 8 — Shift Timing Constraints

**Rule**: An instructor can only be assigned to a lesson slot that falls within their scheduled shift window for the day.

For example, from the May 4 data:

- Quinn Whalen (Centennial Instructor): shift 11:30am–8:45pm → can only be assigned lessons starting 11:30am or later
- Gunner Kinsey (Thornton Instructor): shift 11:45am–4:15pm → cannot be assigned evening lessons

**Evidence**:

- **Employee Schedule Excel — Schedules Summary sheet**: Every row has `Shift Start Time` (col J) and `Shift End Time` (col K). Examples: `11:30 am → 8:45 pm`, `4:15 pm → 8:45 pm`, `12:15 pm → 9:00 pm`
- **Thornton Main Schedule Q2.xlsx — Weekday Template, Cols AE–AF**: "Shift start" and "Shift end" columns in the staffing section — this is where Harry manually enters these times when building the schedule

---

## Rule 9 — Slope Assignment Flexibility (Visual Optimization)

**Rule**: The actual physical slope a lesson is booked on in the SNÖBAHN calendar **does not need to be respected** in the output schedule. The AI can re-assign lessons to different slope columns purely for visual readability.

The goal is: when the same instructor has multiple consecutive lessons, keep them in the same visual column so it's easy to read at a glance.

**Evidence**:

- **Harry call transcript, 00:08:16**: _"So the slope numbers don't matter as much. It's more that we just try to line these up to like look better with your eye because if it's like Matt Martino's here and then he's here and then there, you know, there's a lesson over here. It's kind of hard to for him to read that. So we just like build it out and then once it's built we reshuffle it so it just looks as clean as can be."_
- **Harry call transcript, 00:09:21** (Victor summarizing, Harry confirming): _"If you had a way to generate this report with different views such that some instructor can easily look at the people that are assigned to them... Yes."_

---

## Rule 10 — Credit Count Display

**Rule**: Show the number of remaining credits for each athlete next to their name. This replaces the current color-coding system (which the AI can't reasonably replicate in Excel and which can't be used in calculations).

Credit thresholds for context (currently color-coded):

- 0–1 credits: **Red** (urgent upsell)
- 2–3 credits: **Orange** (upsell soon)
- 4+ credits: **Green** (fine)

The MVP should display the number rather than the color — e.g., `"Alex Johnson (2 credits)"`.

**Evidence**:

- **Harry call transcript, 00:01:08**: _"those colors do mean something. So a red color means they're like out either have zero credits or one credit and then orange means they have three to four... I was thinking almost maybe it's better to just put the number of credits into that schedule. That way, I could then instead of having it because colorcoded, I can't run any equations off of it."_
- **Harry call transcript, 00:01:08**: _"If we if we had it where it was the actual how many credits there were, we could get a list of everyone that is low on credits and then send them an [email]."_
- **Production DB — `credits` table**: Each row is a single credit unit. Available credits = `SELECT COUNT(*) FROM credits WHERE user_id = ? AND used = false`
- **App code — `User.php` line 174**: `getCredits()` method — queries `credits` table where `used = false`

---

## Rule 11 — Wristband Color by Time Slot

**Rule**: Each 30-minute time slot gets a wristband color. The color tells staff when the athlete's session expires and they must leave. The color cycles in a fixed pattern: Purple → Yellow → Red → Blue → Pink → Green → (repeat).

| Lesson Starts At | Athlete Must Be Gone By | Wristband Color |
| ---------------- | ----------------------- | --------------- |
| 7:45am           | 8:00am                  | Purple          |
| 8:15am           | 8:30am                  | Yellow          |
| 8:45am           | 9:00am                  | Red             |
| 9:15am           | 9:30am                  | Blue            |
| 9:45am           | 10:00am                 | Pink            |
| 10:15am          | 10:30am                 | Green           |
| 10:45am          | 11:00am                 | Purple          |
| … (repeats)      |                         |                 |

**Evidence**:

- **Thornton Main Schedule Q2.xlsx — Wristband Color sheet, Rows 1–30**: Full table mapping 30-minute intervals to colors across the full operating day. The pattern repeats every 6 slots (Purple → Yellow → Red → Blue → Pink → Green).
- **Thornton Main Schedule Q2.xlsx — Weekday Template, Col AA**: "KICK OUT TIMES" column header — this is where wristband times appear next to each time slot row

---

## Rule 12 — Operating Hours Vary by Day

**Rule**: Each slope has different opening and closing times per day of week. The schedule should only show time slots within the slope's operating hours for that specific day. Seasonal overrides also exist.

**Evidence**:

- **App code — `Slope.php` line 21–42**: `fillable` array includes `sunday_opens_at`, `sunday_closes_at`, `monday_opens_at`, `monday_closes_at`, ... through Saturday — one open/close per day per slope
- **App code — `Slope.php` line 69–116**: `operating_hours()` method — calculates effective hours by combining the per-day slope config with global settings and any active `SeasonalHour` overrides
- **App code — `Slope.php` line 118–133**: `timeslots()` method — generates the list of 30-minute slot start times within operating hours for a given date
- **Thornton Main Schedule Q2.xlsx**: Separate "Weekday Template" and "Weekend Template" sheets — confirms weekday vs weekend schedules differ, with the weekend template starting at 8am (`Weekday Template - 8am` sheet also exists)

---

## Rule 13 — Blackout Hours

**Rule**: Some time slots may be blocked due to blackout hours (e.g., a slope is closed for maintenance, or a large group has reserved the whole slope). These should appear as blocked in the schedule.

**Evidence**:

- **App code — `Event.php` line 26**: `const BLACKOUT_HOUR = 'blackout_hour'` — distinct event type
- **App code — `Event.php` line 77**: Color for blackout hours is a darkened slope color — visually distinct
- **Production DB — `events` table**: Events of `type = 'blackout_hour'` exist alongside lesson events; both are associated with a slope via `slope_id`

---

## Rule 14 — MVP Scope Boundary

**Rule**: The following are explicitly OUT of scope for the initial AI employee:

| Excluded Item                                      | Reason                                        |
| -------------------------------------------------- | --------------------------------------------- |
| Break scheduling (15min / 30min)                   | "Backfilled, takes a very short time" — Harry |
| Freestyle/trampoline/skate scheduling              | Side panel, separate area, different rules    |
| Commission tracking                                | End-of-day manager input, too dynamic         |
| Employee payroll calculations                      | Already in the source schedule tool           |
| Instructor view (separate per-instructor schedule) | Desirable future feature, too complex for MVP |

**Evidence**:

- **Harry call transcript, 00:05:52**: _"Just the scheduling is like this part takes 80 90% of the time. This over here is kind of backfilled. Takes a very short time."_
- **Harry call transcript, 00:07:11**: _"for the purposes of let's just call it the MVP of this AI employee, if we can figure out what's on rows A through T, that's a big win."_ — "rows A through T" maps to the main slope grid, excluding the right-side panels
- **Harry call transcript, 00:07:11**: _"if the AI can't do this [commission], that's totally fine."_

---

## Data Sources Summary

| Rule                         | Primary Source                                                       |
| ---------------------------- | -------------------------------------------------------------------- |
| Locations & slopes           | Production DB `slopes` + `locations` tables                          |
| Schedule grid structure      | Thornton Main Schedule Q2.xlsx — Weekday Template                    |
| Disciplines                  | Production DB `disciplines` table                                    |
| Ability grouping             | Q2.xlsx — Levels & Ages sheet + DB `abilities` table + `Ability.php` |
| Age grouping                 | Q2.xlsx — Levels & Ages sheet + `Age.php` model                      |
| Lesson types & private rules | Production DB `lesson_types` table + Harry call                      |
| Instructor assignment        | Employee Schedule xlsx + Harry call + ITA sheet                      |
| Shift timing                 | Employee Schedule xlsx — Schedules Summary sheet                     |
| Slope assignment flexibility | Harry call transcript (explicit)                                     |
| Credit count display         | Harry call transcript + DB `credits` table + `User.php`              |
| Wristband colors             | Q2.xlsx — Wristband Color sheet                                      |
| Operating hours              | DB `slopes` table (per-day columns) + `Slope.php`                    |
| Blackout hours               | DB `events` table + `Event.php`                                      |
| MVP scope boundary           | Harry call transcript                                                |
