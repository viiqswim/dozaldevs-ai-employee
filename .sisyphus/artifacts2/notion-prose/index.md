# Notion Prose Capture — Index

**Captured:** 2026-06-17
**Tenant:** VLRE (`00000000-0000-0000-0000-000000000003`)
**Connection:** Composio Notion — **ACTIVE** (connected 2026-06-12T15:49:45Z)
**Tool:** `src/worker-tools/composio/execute.ts` · action `NOTION_GET_PAGE_MARKDOWN`
**Fetch result:** All 3 pages returned `successful: true`, non-empty, `truncated: false`.

---

## Per-Page Summary

| Page file                 | Notion page ID                     | Role                             | Structure type                                                   | Length (bytes) | md5                                |
| ------------------------- | ---------------------------------- | -------------------------------- | ---------------------------------------------------------------- | -------------- | ---------------------------------- |
| `directorio-operativo.md` | `370d540b4380809a8ea0c11074f92abb` | Trash schedule + units           | Nested bullet list under ZIP `##` headings                       | 2533           | `1c9999e53a44d599883aaca107f9668e` |
| `reporte-financiero.md`   | `370d540b438080ca8676e61856488960` | Cleaning prices + times          | Flat bullet list (one line per property) under ZIP `##` headings | 1356           | `8c99070a99ec6acec445ac36da26cbfd` |
| `manual-personal.md`      | `370d540b438080969a72c16c20defc70` | Cleaner zones + scheduling rules | **MIXED** — semi-structured roster + free-prose numbered rules   | 2527           | `94fe6f4cda57b831d28fe339080176a1` |

SHA256 (full):

- `directorio-operativo.md` → `0439f829b4d1153b74ed74a53fa5aef66ea8aa1f7f4129f02fe11af114c86336`
- `reporte-financiero.md` → `756aa399c33acf8e36a46bd4c67b30d5955ff310f7ebfd5254e1a230ee920307`
- `manual-personal.md` → `33cd79496e48eca87e543e819207035cabcfcfa8ca9739e1b785c971032af42b`

> Note: `md5` is computed on the exact markdown string returned in `.data.markdown`. The byte length above is UTF-8 file size (emoji = multi-byte); JS string length is 2400 / 1344 / 2477 respectively.

---

## Page 1 — `directorio-operativo.md` (Trash Schedule)

**Structure:** Markdown bullet list grouped by `## 📍 ZIP CODE: <zip>` headings. Each property is a top-level bullet (`**Address**`) with indented sub-bullets:

- `🏠 **Unidades:**` — unit composition (`Home`, `Rooms 1-N`, `Bundle`, `Loft`, lettered units `A/B/C`)
- `🗑️ **Basura:**` — trash collection day + "(Sacar `<day>`)" set-out day, sometimes a stream label (`General/Reciclaje`)
- occasional `⏰ **Check-out:**` time

**Key data fields visible:** property address, unit breakdown, trash day, trash set-out day, trash stream, (rarely) check-out time.

**Parsing ambiguities (significant):**

1. **Broken heading nesting** — `4402 McKinney Falls Pkwy` bullet ends with `<br>` then the next ZIP header `# 📍 ZIP CODE: 78724, 78741, 78722` is rendered as an H1 **nested inside that bullet** (indented under the property) instead of a top-level `##`. A strict parser would misattribute the 78724/78741/78722 properties (King Charles, Palm Circle, Banton Rd) to the 78744 group or to the McKinney bullet.
2. **Duplicate property** — `4402 McKinney Falls Pkwy` appears twice: once with units `Bundle | Home (A y B)` (line 21-23) and again as `4402 McKinney Falls Pkwy (4402-MCK)` with `Unidades: (No especificado)` (line 27-29).
3. **Inconsistent bold/spacing** — `**Basura: **` (trailing space inside bold), `🏠** Unidades:**` (bold spans the emoji wrong, line 38), `**Unidades**Home A` (no colon, no space, line 32).
4. **Trash-format variance** — formats include `Martes (Sacar Lunes) - General/Reciclaje`, `Jueves (Sacar Miércoles)`, `Martes y Jueves (Sacar Lunes y Miércoles)`, free-text exceptions `Jueves (los propietarios se encargan de sacarla)` and `Martes y Jueves (⚠️ El bote siempre está en la calle)`. Multi-day and owner-handled cases break a single-day regex.

---

## Page 2 — `reporte-financiero.md` (Cleaning Prices + Times)

**Structure:** Flat bullet list — **one bullet per property** — grouped by `## 📍 ZIP <zip>` headings. Each line packs all unit pricing inline.

**Key data fields visible:** property address, then per-unit segments of the form `Type ($price - NNN min)` separated by escaped pipe `\|`. `c/u` ("cada uno" = each) marks per-unit pricing for Rooms.

Example: `7213 Nutria Run: Home (\$160 - 185 min) \| Rooms 1-4 (\$30 c/u - 25 min) \| Room 5 (\$40 - 40 min)`

**Parsing ambiguities (moderate):**

1. **Embedded numeric data** — price and duration live inside free-text parentheses; extraction needs regex on `\$(\d+)` and `(\d+)\s*min`, plus understanding `c/u` multiplies by unit count.
2. **Split unit ranges** — `Rooms 1-4` and `Room 5` are priced separately for 7213 Nutria Run (different price/time), so "Rooms" is not always a single uniform group.
3. **Escaped dollar signs** (`\$`) and a double-space typo (`(\$130 - 180  min)`).
4. **Property-set mismatch vs Page 1** — this page omits `4402 McKinney Falls Pkwy` and `4410`/`4405` partial overlap differs; `6930 Heron Flats` and `8039 Chestnut Cedar` appear here. Cross-referencing the two pages by address is required and is complicated by the mismatch.
5. **Naming variants** — `5306 King Charles Dr` here vs `5306 King Charles` on Page 1.

---

## Page 3 — `manual-personal.md` (Cleaner Zones + Rules)

**Structure: MIXED.** Two distinct halves:

- **Roster (semi-structured)** — `### Códigos <zips>` zone headers, each followed by bullets naming cleaners (`**Yessica:**`, `Berenice:`, ...) with role (primary/backup) and availability in **free-text prose**.
- **`## ⚙️ REGLAS LÓGICAS DE PROGRAMACIÓN` (pure prose)** — a numbered list of business-logic rules written as narrative paragraphs (billing-by-check-in, traslado overhead, equitable distribution, trash-reminder timing).

**Key data fields visible:** cleaner name, assigned ZIP zone(s), role (primary/backup/exclusive), availability schedule, and a body of conditional scheduling rules.

**Parsing ambiguities (high — this is genuinely prose, not data):**

1. **Free-text availability** — e.g. `Lunes a viernes (7 horas, 10AM–5PM) y sábados (11AM - 3PM)`; not a structured schedule object.
2. **Conditional/backup logic in prose** — `backup entre semana en el resto de los códigos 78744 y 78640 (excepto los domingos)`; `si Yessica excede sus 7 horas diarias`.
3. **Inconsistent bolding** — some names bold (`**Yessica:**`, `**Diana:**`, `**Zenaida:**`, `**Norma:**`), others plain (`Berenice:`, `Angela:`, `Susana:`).
4. **Multi-name / state-in-prose** — `Mary or Carrie` (two cleaners, no structure); `Norma: No disponible por el momento` (availability state embedded in text).
5. **Rules are interpretive, not parseable** — the REGLAS section encodes the core scheduling algorithm (cleaning cost is computed on CHECK-INs not CHECK-OUTs; 45-min traslado only for ZIPs 78744/78640 when only trash tasks exist; trash reminders 1 day before for 78744/78640 vs 2-then-1 day before for 78203/78109; "Confirmar recolección y guardar botes" the day after pickup). An AI must _reason over_ this prose, not field-extract it.
6. **Zone grouping differs** — this page groups ZIPs into cleaner zones (78744+78640, 78203+78109, 80421), which does not match the per-property ZIP grouping on Pages 1 & 2 (note 78203 vs 78203&78210, 78109 Converse, 78724/78741/78722 cluster).

---

## Overall Assessment — Can an AI employee reliably extract this by reading the prose?

**Yes for an LLM reading the prose; No for a deterministic parser.**

- These pages are authored for human (and AI) _reading_, not machine parsing. Structure is inconsistent across and within pages: a broken nested H1 heading, duplicate properties, varied bold/spacing, escaped pipes/dollars, per-unit `c/u` pricing semantics, free-text schedules, and conditional backup rules.
- An LLM employee can reliably comprehend each page's intent and pull the relevant facts (trash day for a property, cleaning price/time, which cleaner covers a ZIP). The Spanish prose and emoji headers are not obstacles for an LLM.
- A regex/columnar parser **cannot** be relied upon — there is no stable table schema; Page 3's rules are interpretive logic, and Page 1 has a structurally broken heading that would mis-bucket three properties.
- **Cross-page reconciliation by property address is required** (directory ↔ financial) and is complicated by (a) differing property sets between the two pages and (b) address naming variants. The employee must match on normalized address, tolerate missing entries, and treat the manual's REGLAS as the governing scheduling logic.

**Recommendation for downstream plumbing:** feed all three pages' raw markdown to the employee as reference prose and let the model reason over them. Do **not** build a brittle field-by-field parser against the current page structure.
