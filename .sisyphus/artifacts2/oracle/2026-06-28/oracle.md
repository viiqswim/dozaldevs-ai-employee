# Oracle: 2026-06-28 (Sunday)

## Day-of-Week Verification

```
node -e "const d=new Date('2026-06-28T12:00:00Z'); const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; console.log(days[d.getUTCDay()]);"
→ Sunday
```

**Confirmed: 2026-06-28 is SUNDAY.**

## Raw Checkouts (3 total)

| #   | Listing        | Address         | Unit         | ZIP   | Guest        | Check-In   | Check-Out        |
| --- | -------------- | --------------- | ------------ | ----- | ------------ | ---------- | ---------------- |
| 1   | 3505-BAN-3     | 3505 Banton Rd  | Habitación 3 | 78722 | Hasel Churon | 2026-06-27 | 2026-06-28 11:00 |
| 2   | 4403A-HAY-HOME | 4403 Hayride Ln | Unidad A     | 78744 | Jossy May    | 2026-06-26 | 2026-06-28 11:00 |
| 3   | 4405A-HAY-HOME | 4405 Hayride Ln | Unidad A     | 78744 | Kylan White  | 2026-06-26 | 2026-06-28 11:00 |

## Cleaner Assignments

### ZIP 78722 — 3505 Banton Rd, Room 3

- **Cleaner: AMBIGUITY** — ZIP 78722 has no cleaner assigned in manual-personal.
- ⚠️ **FLAG: No cleaner assigned for ZIP 78722 in manual-personal.**
- Unit type: Habitación 3 (Room)
- Duration: 3505 Banton Rd Rooms 1-3 → $30 c/u - 25 min
- **Cleaning time: 25 min**

### ZIP 78744 — 4403 Hayride Ln, Unit A + 4405 Hayride Ln, Unit A

- **Cleaner: Berenice or Susana** — Sunday. Yessica does NOT work Sundays (Mon-Fri + Sat only). Diana is backup weekdays only (not Sundays). Berenice/Susana are backup for weekends.
- 4403 Hayride Unit A: $80 - 90 min
- 4405 Hayride Unit A: $80 - 90 min
- Total: 90 + 90 = 180 min
- Rule 3 (Distribución Equitativa): These are different properties (4403 vs 4405) but same street. Can assign to one person or split. Since they're separate properties, either assignment is valid.
- **Cleaner: Berenice or Susana** (one person handles both, or split between them)

## Cleaning Schedule Summary

| Cleaner         | Property        | Unit   | Duration | Notes                    |
| --------------- | --------------- | ------ | -------- | ------------------------ |
| UNKNOWN         | 3505 Banton Rd  | Room 3 | 25 min   | No cleaner for ZIP 78722 |
| Berenice/Susana | 4403 Hayride Ln | Unit A | 90 min   | Weekend backup for 78744 |
| Berenice/Susana | 4405 Hayride Ln | Unit A | 90 min   | Weekend backup for 78744 |

## Totals

| Cleaner         | Total Time        |
| --------------- | ----------------- |
| UNKNOWN (78722) | 25 min            |
| Berenice/Susana | 90 + 90 = 180 min |
| **Grand Total** | **205 min**       |

**Arithmetic:** 25 + 90 + 90 = 205 min

## Trash Duties (Sunday 2026-06-28)

### Properties with Monday pickup (78744/78640 — remind Friday, maintain Sat/Sun):

- **7213 Nutria Run (78744):** Monday pickup. Reminder rule: remind from Friday, maintain through weekend. **TODAY IS SUNDAY → Maintain reminder: sacar basura para mañana lunes.**
- **271 Gina Dr (78640):** Monday pickup. **TODAY IS SUNDAY → Maintain reminder: sacar basura para mañana lunes.**

### Properties with Tuesday pickup (remind Monday):

- No action on Sunday for Tuesday pickup properties.

### Properties with Thursday pickup (remind Wednesday):

- **4403 Hayride, 4405 Hayride, 4410 Hayride, 4402 McKinney (78744):** Thursday pickup → remind Wednesday. No action today (Sunday).

### Properties with Tuesday & Thursday pickup in 78203/78109 (2-then-1 day rule):

- **407 S Gevers (78203):** Tuesday & Thursday pickup. 2 days before Tuesday = Sunday (TODAY). **Remind: sacar basura para el martes (2 días antes).**
- **219 Paul St (78203):** "bote siempre está en la calle" — no action needed.
- **6930 Heron Flats (78109):** Tuesday pickup. 2 days before = Sunday (TODAY). **Remind: sacar basura para el martes (2 días antes).**
- **8039 Chestnut Cedar (78109):** Tuesday pickup. 2 days before = Sunday (TODAY). **Remind: sacar basura para el martes (2 días antes).**

### Properties with Friday pickup (remind Thursday):

- **3505 Banton Rd (78722):** Friday pickup → remind Thursday. No action today (Sunday).

## Ambiguities & Flags

1. **ZIP 78722 cleaner unknown:** manual-personal does not assign any cleaner to ZIP 78722 (3505 Banton Rd). This is a gap in the source data.
2. **Sunday staffing:** Yessica does not work Sundays. Diana is backup weekdays only (not Sundays). Only Berenice/Susana available for 78744 on Sundays.
3. **Billing rule requires check-in data:** For 4403 Hayride Unit A and 4405 Hayride Unit A (both are "Home" units), billing depends on whether new guests check in on 2026-06-28. Used unit rate ($80 - 90 min) as default.
4. **4403 vs 4405 Hayride split:** Two separate properties on the same street. Rule 3 says distribute equitably. Could assign one to Berenice and one to Susana, or both to one person. Source data doesn't specify preference.
