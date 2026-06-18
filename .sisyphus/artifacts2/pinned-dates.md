# Pinned Dates — Cleaning Schedule Oracle

5 dates pinned for oracle validation. All data derived from live Hostfully API calls + Notion snapshots.

## Date Table

| Date       | Day of Week  | Checkout Count | Profile                                                                                         | Key Properties                                                                                                              |
| ---------- | ------------ | -------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-15 | **Monday**   | 5              | Medium-volume weekday; multi-ZIP (78640, 78722, 78744); prior oracle mislabeled as Sunday       | 271 Gina Dr (R2), 3505 Banton Rd (R1,R2,R3), 7213 Nutria Run (R1)                                                           |
| 2026-06-20 | **Saturday** | 11             | **High-volume weekend** — busiest day; 5 ZIPs active; Yessica at capacity; backup needed        | 219 Paul St, 271 Gina Dr, 3420 Hovenweep, 407 S Gevers, 4403 Hayride (A,B,S), 5306 King Charles, 7213 Nutria Run (R1,R3,R5) |
| 2026-06-22 | **Monday**   | 1              | **Low-volume weekday** — single checkout in unknown-cleaner ZIP; primarily a trash-reminder day | 6002 Palm Circle (Home, ZIP 78741)                                                                                          |
| 2026-06-28 | **Sunday**   | 3              | Weekend with no Yessica; backup-only day; cross-ZIP (78722 + 78744)                             | 3505 Banton Rd (R3), 4403 Hayride (A), 4405 Hayride (A)                                                                     |
| 2026-07-04 | **Saturday** | 1              | **Holiday (Independence Day)** — minimal volume; single unit; Yessica handles alone             | 4403 Hayride Ln (Unit A)                                                                                                    |

## Day-of-Week Verification

All computed via:

```
node -e "const d=new Date('YYYY-MM-DDT12:00:00Z'); const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; console.log(days[d.getUTCDay()]);"
```

| Date       | Computed | Prior Oracle   | Status       |
| ---------- | -------- | -------------- | ------------ |
| 2026-06-15 | Monday   | Sunday (WRONG) | ✅ Corrected |
| 2026-06-20 | Saturday | N/A (new)      | ✅ Verified  |
| 2026-06-22 | Monday   | N/A (new)      | ✅ Verified  |
| 2026-06-28 | Sunday   | N/A (new)      | ✅ Verified  |
| 2026-07-04 | Saturday | N/A (new)      | ✅ Verified  |

## Hostfully API Call Evidence

All calls made with:

- `HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD` (from tenant_secrets, decrypted)
- `HOSTFULLY_AGENCY_UID=942d08d9-82bb-4fd3-9091-ca0c6b50b578`
- Tool: `./node_modules/.bin/tsx src/worker-tools/hostfully/get-checkouts.ts --date YYYY-MM-DD`

Raw outputs saved to `.sisyphus/artifacts2/oracle/{date}/checkouts.json`
Evidence files saved to `.sisyphus/evidence2/task-3-oracle/{date}.txt`

## Profile Diversity

- ✅ High-volume day: 2026-06-20 (11 checkouts)
- ✅ Medium-volume weekday: 2026-06-15 (5 checkouts)
- ✅ Low-volume weekday: 2026-06-22 (1 checkout)
- ✅ Weekend with backup-only staffing: 2026-06-28 (Sunday, 3 checkouts)
- ✅ Holiday Saturday: 2026-07-04 (1 checkout)
- ✅ Two Mondays (different volumes): 2026-06-15 and 2026-06-22
- ✅ Two Saturdays (different volumes): 2026-06-20 and 2026-07-04
- ✅ One Sunday: 2026-06-28

## Cross-Cutting Findings

1. **ZIP 78722 (3505 Banton Rd) has no assigned cleaner** in manual-personal — appears on 2026-06-15 and 2026-06-28.
2. **ZIP 78724 (5306 King Charles) has no assigned cleaner** in manual-personal — appears on 2026-06-20.
3. **ZIP 78741 (6002 Palm Circle) has no assigned cleaner** in manual-personal — appears on 2026-06-22.
4. **Billing rule (check-in based) requires separate check-in data** — not available from `get-checkouts.ts` alone.
5. **4403 Hayride Unit S** not in reporte-financiero (only A, B, C listed) — appears on 2026-06-20.
6. **6002 Palm Circle ZIP discrepancy:** reporte-financiero places it under 78744 section; API returns 78741.
