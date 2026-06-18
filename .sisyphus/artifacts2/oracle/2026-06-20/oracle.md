# Oracle: 2026-06-20 (Saturday)

## Day-of-Week Verification

```
node -e "const d=new Date('2026-06-20T12:00:00Z'); const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; console.log(days[d.getUTCDay()]);"
→ Saturday
```

**Confirmed: 2026-06-20 is SATURDAY.**

## Raw Checkouts (11 total)

| #   | Listing        | Address              | Unit         | ZIP   | Guest                     | Check-In   | Check-Out        |
| --- | -------------- | -------------------- | ------------ | ----- | ------------------------- | ---------- | ---------------- |
| 1   | 219-PAU-HOME   | 219 Paul Street      | Casa         | 78203 | Luis David Majano Padilla | 2026-06-15 | 2026-06-20 11:00 |
| 2   | 271-GIN-4      | 271 Gina Dr          | Habitación 4 | 78640 | Jeshua Loukas             | 2026-06-17 | 2026-06-20 11:00 |
| 3   | 3420-HOV-HOME  | 3420 Hovenweep Ave   | Casa         | 78744 | Ranar Cook                | 2026-06-19 | 2026-06-20 10:00 |
| 4   | 407-GEV-LOFT   | 407 S Gevers St      | Loft         | 78203 | Damon Williamson          | 2026-06-14 | 2026-06-20 11:00 |
| 5   | 4403A-HAY-HOME | 4403 Hayride Ln      | Unidad A     | 78744 | Bryson Huntley            | 2026-06-14 | 2026-06-20 11:00 |
| 6   | 4403B-HAY-HOME | 4403 Hayride Ln      | Unidad B     | 78744 | Cindy Ingram              | 2026-06-14 | 2026-06-20 11:00 |
| 7   | 4403S-HAY-HOME | 4403 Hayride Ln      | Unidad S     | 78744 | Rhapsody Ann Lott         | 2026-06-14 | 2026-06-20 11:00 |
| 8   | 5306A-KIN-Home | 5306 King Charles Dr | Unidad A     | 78724 | Jeremy Zamora             | 2026-06-14 | 2026-06-20 11:00 |
| 9   | 7213-NUT-1     | 7213 Nutria Run      | Habitación 1 | 78744 | Walyn Garcia              | 2026-06-15 | 2026-06-20 11:00 |
| 10  | 7213-NUT-3     | 7213 Nutria Run      | Habitación 3 | 78744 | Xavier Duncan             | 2026-06-17 | 2026-06-20 11:00 |
| 11  | 7213-NUT-5     | 7213 Nutria Run      | Habitación 5 | 78744 | Jenna Colborn             | 2026-06-19 | 2026-06-20 11:00 |

## Cleaner Assignments

### ZIP 78203 — 219 Paul St (Home) + 407 S Gevers (Loft)

- **Cleaner: Zenaida** (primary for 78203, available all days including Saturday)
- 219 Paul St: Casa (Home) → $120 - 90 min
- 407 S Gevers: Loft → $60 - 60 min
- ⚠️ Billing rule for 219 Paul St (Home): Need check-in data. If no new guest checks in on 2026-06-20 → billed as rooms (not Home). If new guest checks in → billed as Home (90 min). **Flagged as ambiguous — using Home rate (90 min) as default since it's a Home checkout.**
- ⚠️ Billing rule for 407 S Gevers (Loft): Loft is a distinct unit type. Billed as Loft (60 min) regardless.

### ZIP 78640 — 271 Gina Dr, Room 4

- **Cleaner: Diana** (exclusive for 271 Gina Dr every day, including Saturday)
- Unit type: Habitación 4 (Room)
- Duration: 271 Gina Dr Rooms 1-4 → $30 c/u - 25 min
- **Cleaning time: 25 min**

### ZIP 78744 — 3420 Hovenweep Ave (Home)

- **Cleaner: Yessica or Berenice/Susana** — Saturday. Yessica works Saturdays 11AM-3PM (4 hours). 3420 Hovenweep is a Home (100 min). Yessica's Saturday window is 4h = 240 min. She can handle this.
- ⚠️ Note: 3420 Hovenweep has a special check-out time of 10:00 AM (Prioridad de Ruta per directorio-operativo). This is earlier than the standard 11:00 AM.
- Unit type: Casa (Home) → $120 - 100 min
- ⚠️ Billing rule: Home checkout. Need check-in data. Using Home rate (100 min) as default.
- **Cleaner: Yessica** (primary, Saturday available)

### ZIP 78744 — 4403 Hayride Ln (Units A, B, S)

- **Cleaner: Yessica or Berenice/Susana** — Saturday
- 4403 Hayride has Units A, B, C per directorio-operativo. The API returns Units A, B, S. "S" may be a studio or suite — not explicitly listed in reporte-financiero which shows "Unidades A, B y C ($80 c/u - 90 min)". Unit S is likely the same rate.
- ⚠️ **FLAG: Unit S (4403S-HAY-HOME) not in reporte-financiero. Assuming $80 - 90 min same as A/B/C.**
- Duration: 3 units × 90 min = 270 min
- Saturday: Yessica works 11AM-3PM = 240 min. 3420 Hovenweep (100 min) + 4403 Hayride (270 min) = 370 min total for 78744. Exceeds Yessica's 240 min Saturday window.
- **Berenice or Susana needed as backup for overflow.** Rule 3 (Distribución Equitativa): try to assign all rooms of same house to one person.
- Suggested split: Yessica → 3420 Hovenweep (100 min) + 4403A (90 min) = 190 min (fits in 240 min window). Berenice/Susana → 4403B (90 min) + 4403S (90 min) = 180 min.
- ⚠️ Alternative: Yessica does all of 4403 (270 min) + Hovenweep (100 min) = 370 min — exceeds her 240 min Saturday limit. Not feasible.

### ZIP 78744 — 7213 Nutria Run (Rooms 1, 3, 5)

- **Cleaner: Yessica or Berenice/Susana** — Saturday
- Room 1: $30 - 25 min; Room 3: $30 - 25 min; Room 5: $40 - 40 min
- Total: 25 + 25 + 40 = 90 min
- Given Yessica is already at capacity (see above), Berenice/Susana handles 7213 Nutria Run.
- ⚠️ Rule 3: Try to keep all rooms of same house together. Assign all 3 rooms to one backup cleaner.

### ZIP 78724 — 5306 King Charles Dr, Unit A

- **Cleaner: AMBIGUITY** — ZIP 78724 is in the "78724, 78741, 78722" group in directorio-operativo but manual-personal does NOT assign a cleaner to ZIP 78724.
- ⚠️ **FLAG: No cleaner assigned for ZIP 78724 in manual-personal.**
- Unit type: Home A → $80 - 90 min
- **Cleaning time: 90 min**

## Cleaning Schedule Summary

| Cleaner         | Property          | Unit   | Duration | Notes                        |
| --------------- | ----------------- | ------ | -------- | ---------------------------- |
| Zenaida         | 219 Paul St       | Home   | 90 min   | Primary 78203                |
| Zenaida         | 407 S Gevers      | Loft   | 60 min   | Primary 78203                |
| Diana           | 271 Gina Dr       | Room 4 | 25 min   | Exclusive for this property  |
| Yessica         | 3420 Hovenweep    | Home   | 100 min  | Primary 78744, Sat 11AM-3PM  |
| Yessica         | 4403 Hayride      | Unit A | 90 min   | Primary 78744                |
| Berenice/Susana | 4403 Hayride      | Unit B | 90 min   | Backup (Yessica at capacity) |
| Berenice/Susana | 4403 Hayride      | Unit S | 90 min   | Backup (Yessica at capacity) |
| Berenice/Susana | 7213 Nutria Run   | Room 1 | 25 min   | Backup (Yessica at capacity) |
| Berenice/Susana | 7213 Nutria Run   | Room 3 | 25 min   | Backup (Yessica at capacity) |
| Berenice/Susana | 7213 Nutria Run   | Room 5 | 40 min   | Backup (Yessica at capacity) |
| UNKNOWN         | 5306 King Charles | Unit A | 90 min   | No cleaner for ZIP 78724     |

## Totals

| Cleaner         | Total Time                                         |
| --------------- | -------------------------------------------------- |
| Zenaida         | 90 + 60 = 150 min                                  |
| Diana           | 25 min                                             |
| Yessica         | 100 + 90 = 190 min (within 240 min Saturday limit) |
| Berenice/Susana | 90 + 90 + 25 + 25 + 40 = 270 min                   |
| UNKNOWN (78724) | 90 min                                             |
| **Grand Total** | **725 min**                                        |

**Arithmetic:** 90 + 60 + 25 + 100 + 90 + 90 + 90 + 25 + 25 + 40 + 90 = 725 min

## Trash Duties (Saturday 2026-06-20)

### Properties with Monday pickup (78744/78640 — remind Friday, maintain Sat/Sun):

- **7213 Nutria Run (78744):** Monday pickup. Reminder rule: remind from Friday, maintain through weekend. **TODAY IS SATURDAY → Maintain reminder: sacar basura para el lunes.**
- **271 Gina Dr (78640):** Monday pickup. **TODAY IS SATURDAY → Maintain reminder: sacar basura para el lunes.**

### Properties with Tuesday pickup (remind Monday):

- No action on Saturday for Tuesday pickup properties.

### Properties with Thursday pickup (remind Wednesday):

- No action on Saturday for Thursday pickup properties.

### Properties with Tuesday & Thursday pickup in 78203/78109 (2-then-1 day rule):

- **407 S Gevers (78203):** Tuesday & Thursday pickup. 2 days before Tuesday = Sunday (tomorrow). **TODAY IS SATURDAY → No action yet for Tuesday pickup.** 2 days before Thursday = Tuesday. No action yet.
- **219 Paul St (78203):** "bote siempre está en la calle" — no action needed.
- **6930 Heron Flats (78109):** Tuesday pickup. 2 days before = Sunday (tomorrow). No action today.
- **8039 Chestnut Cedar (78109):** Tuesday pickup. 2 days before = Sunday (tomorrow). No action today.

### No trash duties triggered on Saturday 2026-06-20 for active properties.

(Monday pickup reminder is maintained from Friday through weekend — already set Friday.)

## Ambiguities & Flags

1. **ZIP 78724 cleaner unknown:** 5306 King Charles Dr has no cleaner assigned in manual-personal.
2. **Unit S at 4403 Hayride:** Not listed in reporte-financiero. Assumed $80 - 90 min same as Units A/B/C.
3. **Billing rule requires check-in data:** For Homes (219 Paul St, 3420 Hovenweep), billing depends on whether new guests check in on 2026-06-20. Used Home rate as default.
4. **Yessica Saturday capacity:** 4h window (11AM-3PM = 240 min). Assigned 190 min — feasible. Backup needed for remaining 78744 properties.
5. **3420 Hovenweep priority checkout:** 10:00 AM checkout (earlier than standard 11:00 AM). Yessica should prioritize this property first in her Saturday route.
6. **4403 Hayride Unit S vs Unit C:** directorio-operativo lists Units A, B, C. API returns Units A, B, S. "S" may be a studio/suite not in the Notion docs — possible data inconsistency.
