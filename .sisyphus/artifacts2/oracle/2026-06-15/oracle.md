# Oracle: 2026-06-15 (Monday)

## Day-of-Week Verification

```
node -e "const d=new Date('2026-06-15T12:00:00Z'); const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; console.log(days[d.getUTCDay()]);"
→ Monday
```

**Confirmed: 2026-06-15 is MONDAY.** (Prior oracle incorrectly labeled this as Sunday — do not repeat.)

## Raw Checkouts (5 total)

| #   | Listing    | Address         | Unit         | ZIP   | Guest                   | Check-In   | Check-Out        |
| --- | ---------- | --------------- | ------------ | ----- | ----------------------- | ---------- | ---------------- |
| 1   | 271-GIN-2  | 271 Gina Dr     | Habitación 2 | 78640 | Evan Chapman            | 2026-06-12 | 2026-06-15 11:00 |
| 2   | 3505-BAN-1 | 3505 Banton Rd  | Habitación 1 | 78722 | Anthony Frattarelli     | 2026-06-14 | 2026-06-15 11:00 |
| 3   | 3505-BAN-2 | 3505 Banton Rd  | Habitación 2 | 78722 | Priscilla Kelly         | 2026-06-12 | 2026-06-15 11:00 |
| 4   | 3505-BAN-3 | 3505 Banton Rd  | Habitación 3 | 78722 | Kimberly Rose Hantschke | 2026-06-12 | 2026-06-15 11:00 |
| 5   | 7213-NUT-1 | 7213 Nutria Run | Habitación 1 | 78744 | P Rubio                 | 2026-06-12 | 2026-06-15 11:00 |

## Cleaner Assignments

### ZIP 78640 — 271 Gina Dr, Room 2

- **Cleaner: Diana** (exclusive for 271 Gina Dr every day)
- Unit type: Habitación (Room)
- Duration from reporte-financiero: 271 Gina Dr Rooms 1-4 → $30 c/u - 25 min
- **Cleaning time: 25 min**
- ⚠️ Billing rule: Room checkout. Need to check if a new guest checks IN on 2026-06-15 at 271 Gina Dr Room 2. If yes → billed as room (25 min). If no → still billed as room (same result for rooms). No ambiguity here since it's already a room.

### ZIP 78722 — 3505 Banton Rd, Rooms 1, 2, 3

- **Cleaner: AMBIGUITY** — ZIP 78722 is listed in directorio-operativo under "78724, 78741, 78722" group, but manual-personal does NOT assign a cleaner to ZIP 78722 explicitly. The cleaner roster only covers 78744/78640 (Yessica/Diana), 78203/78109 (Zenaida), and 80421 (Mary/Carrie). ZIP 78722 has no named cleaner.
- ⚠️ **FLAG: No cleaner assigned for ZIP 78722 in manual-personal. Cannot determine assignment from source data.**
- Unit types: Habitación 1, 2, 3 (Rooms)
- Duration from reporte-financiero: 3505 Banton Rd Rooms 1-3 → $30 c/u - 25 min each
- **Cleaning time per room: 25 min × 3 rooms = 75 min total**
- ⚠️ Billing rule: 3 rooms checkout. If new guests check in on 2026-06-15 → billed per room (same). If Home checks in → billed as Home. Need check-in data to confirm.

### ZIP 78744 — 7213 Nutria Run, Room 1

- **Cleaner: Yessica** (primary for 78744, Mon-Fri)
- Monday is a weekday → Yessica is primary
- Unit type: Habitación 1 (Room)
- Duration from reporte-financiero: 7213 Nutria Run Rooms 1-4 → $30 c/u - 25 min; Room 5 → $40 - 40 min
- Room 1 = standard room → **25 min**
- ⚠️ Billing rule: Room checkout. If new guest checks in → billed as room (same). No ambiguity.

## Cleaning Schedule Summary

| Cleaner | Property        | Unit   | Duration | Notes                             |
| ------- | --------------- | ------ | -------- | --------------------------------- |
| Diana   | 271 Gina Dr     | Room 2 | 25 min   | Exclusive for this property       |
| UNKNOWN | 3505 Banton Rd  | Room 1 | 25 min   | No cleaner assigned for ZIP 78722 |
| UNKNOWN | 3505 Banton Rd  | Room 2 | 25 min   | No cleaner assigned for ZIP 78722 |
| UNKNOWN | 3505 Banton Rd  | Room 3 | 25 min   | No cleaner assigned for ZIP 78722 |
| Yessica | 7213 Nutria Run | Room 1 | 25 min   | Primary for 78744 weekdays        |

## Totals

| Cleaner         | Total Time  |
| --------------- | ----------- |
| Diana           | 25 min      |
| UNKNOWN (78722) | 75 min      |
| Yessica         | 25 min      |
| **Grand Total** | **125 min** |

**Arithmetic:** 25 + 25 + 25 + 25 + 25 = 125 min

## Trash Duties (Monday 2026-06-15)

### Properties with Monday pickup (trash goes out Sunday):

- **7213 Nutria Run (78744):** Monday pickup. Reminder rule for 78744: 1 day before = Sunday. Since today IS Monday (pickup day), this is the day after the reminder. Task: **"Confirmar recolección y guardar botes"** for 7213 Nutria Run.
- **271 Gina Dr (78640):** Monday pickup. Reminder rule for 78640: 1 day before = Sunday (and maintained Fri-Sun). Since today IS Monday (pickup day), task: **"Confirmar recolección y guardar botes"** for 271 Gina Dr.

### Properties with Tuesday pickup (remind Monday = today):

- **3401 Breckenridge Dr (78744):** Tuesday pickup → remind Monday. **TODAY IS MONDAY → Remind: sacar basura para mañana martes.**
- **3412 Sand Dunes Ave (78744):** Tuesday pickup → remind Monday. **TODAY IS MONDAY → Remind: sacar basura para mañana martes.**
- **3420 Hovenweep Ave (78744):** Tuesday pickup → remind Monday. **TODAY IS MONDAY → Remind: sacar basura para mañana martes.**
- **6002 Palm Circle (78741):** Tuesday pickup → remind Monday. **TODAY IS MONDAY → Remind: sacar basura para mañana martes.** (⚠️ ZIP 78741 — no cleaner assigned in manual-personal)

### Properties with Tuesday pickup in 78203/78109 (2-then-1 day rule):

- **407 S Gevers (78203):** Tuesday & Thursday pickup. 2 days before Tuesday = Sunday (already passed). 1 day before Tuesday = Monday (TODAY). **Remind: sacar basura para mañana martes.**
- **219 Paul St (78203):** Tuesday & Thursday pickup. Note: "bote siempre está en la calle" — no action needed for putting out.
- **6930 Heron Flats (78109):** Tuesday pickup. 2 days before = Sunday (passed). 1 day before = Monday (TODAY). **Remind: sacar basura para mañana martes.**
- **8039 Chestnut Cedar (78109):** Tuesday pickup. 2 days before = Sunday (passed). 1 day before = Monday (TODAY). **Remind: sacar basura para mañana martes.**

### Properties with Friday pickup (remind Thursday):

- **3505 Banton Rd (78722):** Friday pickup → remind Thursday. No action today (Monday).

### Properties with Thursday pickup (remind Wednesday):

- **4403 Hayride, 4405 Hayride, 4410 Hayride, 4402 McKinney (78744):** Thursday pickup → remind Wednesday. No action today (Monday).

### Properties with Thursday pickup (owners handle):

- **5306 King Charles (78724):** Thursday pickup → owners handle. No action.

## Ambiguities & Flags

1. **ZIP 78722 cleaner unknown:** manual-personal does not assign any cleaner to ZIP 78722 (3505 Banton Rd). This is a gap in the source data.
2. **ZIP 78741 cleaner unknown:** 6002 Palm Circle (78741) has no cleaner assigned in manual-personal. Trash reminder applies but no cleaner can be assigned.
3. **Billing rule requires check-in data:** Rule 1 says billing is based on check-ins, not check-outs. This oracle uses checkout data only. For rooms, the billing is the same regardless. For Homes, the billing could differ if a new guest checks in.
4. **3505 Banton Rd address discrepancy:** The listing shows "3505 Banton Rd, Unit B" for all 3 rooms, but directorio-operativo lists "3505 Banton Rd" with "Rooms 1-3". The "Unit B" in the listing name may indicate a sub-building — unclear if this affects cleaner routing.
