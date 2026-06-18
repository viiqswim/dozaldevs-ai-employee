# Pinned Checkout Dates — VLRE Cleaning Schedule Testing

**Generated:** 2026-06-16
**Tenant:** VLRE (`00000000-0000-0000-0000-000000000003`)
**Source tool:** `src/worker-tools/hostfully/get-checkouts.ts` (live Hostfully API, decrypted tenant secrets)
**Candidates probed (12):** 2026-05-15, 2026-05-25, 2026-06-12, 2026-06-15, 2026-06-20, 2026-06-21, 2026-06-22, 2026-06-25, 2026-06-28, 2026-06-30, 2026-07-03, 2026-07-10

These three dates were selected for varied operational profiles (high-volume multi-zone, medium multi-zone, single checkout) to exercise the cleaning-schedule employee across realistic load and zoning conditions.

---

## Selection Summary

| Date       | Checkouts | Distinct ZIP zones | Profile                    |
| ---------- | --------- | ------------------ | -------------------------- |
| 2026-06-20 | 10        | 4                  | High volume + multi-zone   |
| 2026-06-15 | 5         | 3                  | Medium volume + multi-zone |
| 2026-06-22 | 1         | 1                  | Single checkout            |

✅ **Multi-zone requirement met:** 2026-06-20 spans 4 distinct ZIP zones (78203, 78640, 78724, 78744); 2026-06-15 spans 3 (78640, 78722, 78744).

---

## Date 1 — 2026-06-20 (HIGH volume, multi-zone)

- **Checkout count:** 10
- **Distinct ZIP zones:** 4 → `78203` (San Antonio), `78640` (Kyle), `78724` (Austin), `78744` (Austin)
- **ZIP breakdown:** 78744×6, 78203×2, 78640×1, 78724×1
- **Channels:** AIRBNB (9), VRBO (1)

Raw checkout summary:

- 219-PAU-HOME | 219 Paul Street | ZIP 78203 (San Antonio, TX) | room: Casa | out 11:00 | AIRBNB | Luis David Majano Padilla
- 271-GIN-4 | 271 Gina Dr | ZIP 78640 (Kyle, TX) | room: Habitación 4 | out 11:00 | AIRBNB | Jeshua Loukas
- 407-GEV-LOFT | 407 South Gevers Street | ZIP 78203 (San Antonio, TX) | room: Loft | out 11:00 | AIRBNB | Damon Williamson
- 4403A-HAY-HOME | 4403 Hayride Lane | ZIP 78744 (Austin, TX) | room: Unidad A | out 11:00 | AIRBNB | Bryson Huntley
- 4403B-HAY-HOME | 4403 Hayride Lane | ZIP 78744 (Austin, TX) | room: Unidad B | out 11:00 | AIRBNB | Cindy Ingram
- 4403S-HAY-HOME | 4403 Hayride Ln | ZIP 78744 (Austin, TX) | room: Unidad S | out 11:00 | VRBO | Rhapsody Ann Lott
- 5306A-KIN-Home | 5306 King Charles Drive | ZIP 78724 (Austin, TX) | room: Unidad A | out 11:00 | AIRBNB | Jeremy Zamora
- 7213-NUT-1 | 7213 Nutria Run | ZIP 78744 (Austin, TX) | room: Habitación 1 | out 11:00 | AIRBNB | Walyn Garcia
- 7213-NUT-3 | 7213 Nutria Run | ZIP 78744 (Austin, TX) | room: Habitación 3 | out 11:00 | AIRBNB | Xavier Duncan
- 7213-NUT-5 | 7213 Nutria Run | ZIP 78744 (Austin, TX) | room: Habitación 5 | out 11:00 | AIRBNB | Jenna Colborn

Raw JSON: `.sisyphus/artifacts/correctness-oracle/2026-06-20/checkouts.json`

---

## Date 2 — 2026-06-15 (MEDIUM volume, multi-zone)

- **Checkout count:** 5
- **Distinct ZIP zones:** 3 → `78640` (Kyle), `78722` (Austin), `78744` (Austin)
- **ZIP breakdown:** 78722×3, 78640×1, 78744×1
- **Channels:** AIRBNB (5)

Raw checkout summary:

- 271-GIN-2 | 271 Gina Dr | ZIP 78640 (Kyle, TX) | room: Habitación 2 | out 11:00 | AIRBNB | Evan Chapman
- 3505-BAN-1 | 3505 Banton Rd, Unit B | ZIP 78722 (Austin, TX) | room: Habitación 1 | out 11:00 | AIRBNB | Anthony Frattarelli
- 3505-BAN-2 | 3505 Banton Rd, Unit B | ZIP 78722 (Austin, TX) | room: Habitación 2 | out 11:00 | AIRBNB | Priscilla Kelly
- 3505-BAN-3 | 3505 Banton Rd, Unit B | ZIP 78722 (Austin, TX) | room: Habitación 3 | out 11:00 | AIRBNB | Kimberly Rose Hantschke
- 7213-NUT-1 | 7213 Nutria Run | ZIP 78744 (Austin, TX) | room: Habitación 1 | out 11:00 | AIRBNB | P Rubio

Raw JSON: `.sisyphus/artifacts/correctness-oracle/2026-06-15/checkouts.json`

---

## Date 3 — 2026-06-22 (SINGLE checkout)

- **Checkout count:** 1
- **Distinct ZIP zones:** 1 → `78741` (Austin)
- **ZIP breakdown:** 78741×1
- **Channels:** VRBO (1)

Raw checkout summary:

- 6002-PAL-HOME | 6002 Palm Circle | ZIP 78741 (Austin, TX) | room: Casa | out 11:00 | VRBO | Laurie Rotondo

Raw JSON: `.sisyphus/artifacts/correctness-oracle/2026-06-22/checkouts.json`

---

## Additional probe results (for reference)

| Date       | Checkouts | ZIP zones | Zones                      |
| ---------- | --------- | --------- | -------------------------- |
| 2026-06-12 | 10        | 4         | 80421, 78640, 78744, 78722 |
| 2026-05-25 | 9         | 3         | 78203, 78744, 78722        |
| 2026-05-15 | 7         | 1         | 78744                      |
| 2026-06-21 | 4         | 2         | 78744, 78722               |
| 2026-06-28 | 3         | 2         | 78722, 78744               |
| 2026-06-25 | 1         | 1         | 78744                      |
| 2026-07-03 | 1         | 1         | 78744                      |
| 2026-07-10 | 1         | 1         | 78744                      |
| 2026-06-30 | 0         | 0         | (none)                     |

---

## Model catalog confirmation

`deepseek/deepseek-v4-flash` is **PRESENT and ACTIVE** in `model_catalog`
(id `1f129698-1586-428b-82f0-9a0300cb9985`, `is_active=true`, `supports_tools=true`).
Verified via both psql and `GET /admin/model-catalog`. No fallback needed.
Full evidence: `.sisyphus/evidence/task-2-model.txt`.
