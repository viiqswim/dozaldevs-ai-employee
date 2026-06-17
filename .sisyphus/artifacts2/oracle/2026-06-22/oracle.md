# Oracle: 2026-06-22 (Monday)

## Day-of-Week Verification

```
node -e "const d=new Date('2026-06-22T12:00:00Z'); const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; console.log(days[d.getUTCDay()]);"
→ Monday
```

**Confirmed: 2026-06-22 is MONDAY.**

## Raw Checkouts (1 total)

| #   | Listing       | Address          | Unit | ZIP   | Guest          | Check-In   | Check-Out        |
| --- | ------------- | ---------------- | ---- | ----- | -------------- | ---------- | ---------------- |
| 1   | 6002-PAL-HOME | 6002 Palm Circle | Casa | 78741 | Laurie Rotondo | 2026-06-21 | 2026-06-22 11:00 |

## Cleaner Assignments

### ZIP 78741 — 6002 Palm Circle (Home)

- **Cleaner: AMBIGUITY** — ZIP 78741 is in the "78724, 78741, 78722" group in directorio-operativo but manual-personal does NOT assign a cleaner to ZIP 78741.
- ⚠️ **FLAG: No cleaner assigned for ZIP 78741 in manual-personal.**
- Unit type: Casa (Home) → $130 - 180 min (from reporte-financiero: "6002 Palm Circle: Home ($130 - 180 min)")
- ⚠️ Note: reporte-financiero lists 6002 Palm Circle under ZIP 78744 section, but directorio-operativo places it under "78724, 78741, 78722" group. The API returns zipCode: 78741. The reporte-financiero section header may be wrong, or the property may straddle ZIP boundaries. Using the API's ZIP (78741) as authoritative.
- **Cleaning time: 180 min**
- ⚠️ Billing rule: Home checkout. Need check-in data. Using Home rate (180 min) as default.

## Cleaning Schedule Summary

| Cleaner | Property         | Unit | Duration | Notes                    |
| ------- | ---------------- | ---- | -------- | ------------------------ |
| UNKNOWN | 6002 Palm Circle | Home | 180 min  | No cleaner for ZIP 78741 |

## Totals

| Cleaner         | Total Time  |
| --------------- | ----------- |
| UNKNOWN (78741) | 180 min     |
| **Grand Total** | **180 min** |

**Arithmetic:** 180 min

## Trash Duties (Monday 2026-06-22)

### Properties with Monday pickup (78744/78640 — pickup day):

- **7213 Nutria Run (78744):** Monday pickup. Today IS Monday (pickup day). Task: **"Confirmar recolección y guardar botes"** for 7213 Nutria Run.
- **271 Gina Dr (78640):** Monday pickup. Today IS Monday (pickup day). Task: **"Confirmar recolección y guardar botes"** for 271 Gina Dr.

### Properties with Tuesday pickup (remind Monday = today):

- **3401 Breckenridge Dr (78744):** Tuesday pickup → remind Monday. **TODAY IS MONDAY → Remind: sacar basura para mañana martes.**
- **3412 Sand Dunes Ave (78744):** Tuesday pickup → remind Monday. **TODAY IS MONDAY → Remind: sacar basura para mañana martes.**
- **3420 Hovenweep Ave (78744):** Tuesday pickup → remind Monday. **TODAY IS MONDAY → Remind: sacar basura para mañana martes.**
- **6002 Palm Circle (78741):** Tuesday pickup → remind Monday. **TODAY IS MONDAY → Remind: sacar basura para mañana martes.** (⚠️ ZIP 78741 — no cleaner assigned)

### Properties with Tuesday pickup in 78203/78109 (2-then-1 day rule):

- **407 S Gevers (78203):** Tuesday & Thursday pickup. 1 day before Tuesday = Monday (TODAY). **Remind: sacar basura para mañana martes.**
- **219 Paul St (78203):** Tuesday & Thursday pickup. "bote siempre está en la calle" — no action needed.
- **6930 Heron Flats (78109):** Tuesday pickup. 1 day before = Monday (TODAY). **Remind: sacar basura para mañana martes.**
- **8039 Chestnut Cedar (78109):** Tuesday pickup. 1 day before = Monday (TODAY). **Remind: sacar basura para mañana martes.**

### Properties with Thursday pickup (remind Wednesday):

- **4403 Hayride, 4405 Hayride, 4410 Hayride, 4402 McKinney (78744):** Thursday pickup → remind Wednesday. No action today (Monday).

### Properties with Friday pickup (remind Thursday):

- **3505 Banton Rd (78722):** Friday pickup → remind Thursday. No action today (Monday).

## Ambiguities & Flags

1. **ZIP 78741 cleaner unknown:** manual-personal does not assign any cleaner to ZIP 78741 (6002 Palm Circle). This is a gap in the source data.
2. **6002 Palm Circle ZIP discrepancy:** reporte-financiero lists it under ZIP 78744 section, but API returns 78741 and directorio-operativo groups it with 78724/78741/78722. Using API ZIP (78741) as authoritative.
3. **Billing rule requires check-in data:** For 6002 Palm Circle (Home), billing depends on whether a new guest checks in on 2026-06-22. Used Home rate (180 min) as default.
4. **Low-volume day:** Only 1 checkout. Primarily a trash-reminder day for multiple properties.
5. **No 78744/78640 cleanings:** Despite trash duties for 78744 properties, no cleanings are scheduled there. Per Rule 2 (Tiempos Extra por Traslado): if there are trash tasks but no cleanings in 78744/78640, add 45 min travel time. However, since the only checkout is in 78741 (unknown cleaner), and the trash reminders are notifications (not physical tasks requiring travel), this rule may not apply. ⚠️ **FLAG: Unclear if trash reminder tasks alone trigger the 45-min traslado rule.**
