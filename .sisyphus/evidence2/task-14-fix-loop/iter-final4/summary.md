# iter-final4 Summary — T14 REOPEN Fix

**Date**: 2026-06-17  
**Commit**: `9a013900`  
**Branch**: main  
**Commit message**: `fix(archetype-generator): mirror strong closed-allowlist exact-key enforcement into converse path`

---

## Root Cause (from T15 v3 failure at 3/5)

`buildConverseSystemPromptPre` (wizard/converse-create path) had only WEAK closed-allowlist language. The `SYSTEM_PROMPT_PRE` (refine path) had STRONG exact-key membership + REQUIRED VERBATIM PHRASE + no-geographic-grouping. The two paths were asymmetric, causing the wizard-created employee to group nearby ZIPs (78741 grouped under 78744, 78722 grouped under 78744) instead of marking them UNASSIGNED.

---

## Fix Applied

**File**: `src/gateway/services/prompts/archetype-generator-prompts.ts`

Four edits to `buildConverseSystemPromptPre`:

1. **Coverage-gap bullet** (RULE-ENCODING PATTERN): Added "Do NOT group nearby keys. Do NOT infer coverage from geographic proximity... Do NOT assign to a nearby team member to fill the gap — the item must remain UNASSIGNED."

2. **Closed-Allowlist Coverage Rule bullet**: Added exact-key enforcement: "the key used for lookup MUST be the exact identifier from the roster... NEVER determine a property's key from the property directory" + "The coverage key MUST come from the work item itself (e.g., the checkout data), NOT from any reference Notion page."

3. **CONCRETE EXECUTION STEPS PATTERN item 2**: Replaced weak UNASSIGNED bullet with per-item exact-key check with two-case distinction (not-in-set → UNASSIGNED, in-set → assign).

4. **RUNTIME REFERENCE-DATA EXTRACTION PATTERN step 3**: Strengthened to two-case with exact-key from work item, not from reference page.

**File**: `tests/unit/generator-prompts-parity.test.ts`

Added 6 new assertions (25 total, was 17+2 from iter-final3):

- Both paths contain `"Do NOT group nearby"`
- Both paths contain `"Do NOT assign to a nearby team member to fill the gap"`
- Both paths contain `"coverage key"` + `"MUST come from the work item itself"`

---

## Employee Created

**cleaning-schedule-v25** — created via 2-turn converse-create from simple description.

- Archetype ID: `50419c8e-2413-4e57-8c38-d292decb495a`
- Tenant: `00000000-0000-0000-0000-000000000003` (VLRE)
- Model: `deepseek/deepseek-v4-flash`
- VM size: `performance-1x`
- Status: `active`

**HARD GATES passed**:

- `{{target_date}}` ×4 ✅
- Zero plumbing (`printenv INPUT_`) ✅
- All 3 Notion page IDs verbatim ✅
- Zero hardcoded business data ✅

**Strong-language check**:

- "CLOSED" ×1 ✅
- "exact ZIP" ×1 ✅
- "Do NOT infer coverage" ×1 ✅

---

## Run 1 Results (5/5)

| Date  | Task ID    | Critical assertion                                                   | Result |
| ----- | ---------- | -------------------------------------------------------------------- | ------ |
| 06-15 | `1a01a2b9` | 78722 → UNASSIGNED; 78744 → Yessica; 78640 → Diana                   | ✅     |
| 06-20 | `11cdf04a` | Yessica 190min ≤ 240min; 4403 Hayride → Berenice; 78724 → UNASSIGNED | ✅     |
| 06-22 | `2b5f9367` | 78741 (6002 Palm Circle) → UNASSIGNED                                | ✅     |
| 06-28 | `bed300e9` | 78722 (3505 Banton) → UNASSIGNED; 4403/4405 Hayride → Berenice       | ✅     |
| 07-04 | `edb6ddda` | 4403 Hayride → Yessica (90min ≤ 240min)                              | ✅     |

---

## Determinism Run (Run 2 — 4 edge dates re-triggered)

| Date  | Task ID    | Critical assertion                                             | Result |
| ----- | ---------- | -------------------------------------------------------------- | ------ |
| 06-20 | `23b153de` | 78724 → UNASSIGNED; Yessica 190min; 4403 Hayride → Berenice    | ✅     |
| 06-22 | `d1d12786` | 78741 (6002 Palm Circle) → UNASSIGNED                          | ✅     |
| 06-28 | `6d7e61fe` | 78722 (3505 Banton) → UNASSIGNED; 4403/4405 Hayride → Berenice | ✅     |
| 07-04 | `bec1ed92` | 4403 Hayride → Yessica (90min ≤ 240min)                        | ✅     |

**Determinism: CONFIRMED — all 4 edge dates stable across two independent runs.**

---

## Genericity Proof

Regenerated `daily-motivational-messenger` via converse-create:

- No forbidden cleaning/ZIP/cleaner terms leaked ✅
- No plumbing leaks ✅
- No closed-allowlist language leaked into non-roster employee ✅
- Clean execution steps ✅

---

## Tests

- `pnpm build`: ✅ clean
- `pnpm test:unit` (85 tests): ✅ 60 archetype-generator + 25 parity
- Lint (pre-commit hook): ✅ clean

---

## Final Score

**5/5 deterministically** — both runs, all oracle dates, all critical assertions confirmed.
