# Lock & Property Discrepancy Report

> Generated 2026-05-13 from `property-lock-passcode-map.json` — a cross-reference of Sifely locks (73 total from live API), vlre-hub listing assignments (40 listings), and Hostfully properties across all VL Real Estate properties.
>
> **Data sources**: Sifely API (live query 2026-05-14), vlre-hub `properties.json` (listing→lock assignments), Hostfully GraphQL API (property UIDs).

## 1. Listings Without Working Sifely Locks

Listings defined in vlre-hub whose assigned lock IDs were not found on the Sifely account.

| Listing           | Type      | Address                          | Hub Lock IDs       | Issue                                                                      |
| ----------------- | --------- | -------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| **1602-BLU-HOME** | home      | 1602 Bluebird Dr, Bailey, CO     | 16559198, 16559224 | Both lock IDs not found on Sifely — possibly on a different Sifely account |
| **407-GEV-LOFT**  | multiHome | 407 S Gevers St, San Antonio, TX | 8500612            | Lock not found — probable replacement: `407-Gev-Loft-official` (31136280)  |

**Partially affected**: 219-PAU-HOME front door (5280922) was replaced by `219-pau Front door (new)` (25762100). vlre-hub still references the old ID. Back door (5197968) works fine.

## 2. Replaced Locks (vlre-hub Outdated)

Lock IDs in vlre-hub that no longer exist on Sifely, with their probable replacements.

| Listing        | Old Lock ID | Old Name                | New Lock ID | New Alias                | Evidence                              |
| -------------- | ----------- | ----------------------- | ----------- | ------------------------ | ------------------------------------- |
| 219-PAU-HOME   | 5280922     | 219-PAU-HOME-FRONT-DOOR | 25762100    | 219-pau Front door (new) | Alias contains "(new)"                |
| 407-GEV-BUNDLE | 8500612     | 407-GEV-LOFT-FRONT-DOOR | 31136280    | 407-Gev-Loft-official    | Alias contains "official"             |
| 407-GEV-LOFT   | 8500612     | 407-GEV-LOFT-FRONT-DOOR | 31136280    | 407-Gev-Loft-official    | Same lock, referenced by two listings |
| 1602-BLU-HOME  | 16559198    | 1602-BLU-FRONT-DOOR     | —           | —                        | No replacement found on Sifely        |
| 1602-BLU-HOME  | 16559224    | 1602-BLU-BACK-DOOR      | —           | —                        | No replacement found on Sifely        |

**Action required**: Update vlre-hub `properties.json` with the new lock IDs for 219-PAU and 407-GEV. Investigate 1602-BLU — locks may be on a different Sifely account.

## 3. Unassigned Non-Utility Locks

Locks on Sifely that are NOT pantries, closets, garages, storage, laundry, or patios — and are NOT assigned to any vlre-hub listing. These likely need to be added.

| Lock Alias                         | Lock ID    | Inferred Property | Category   | Battery | Gateway | Passcodes | Action Needed                                 |
| ---------------------------------- | ---------- | ----------------- | ---------- | ------- | ------- | --------- | --------------------------------------------- |
| **7213-Nut-Room4**                 | `6138964`  | 7213-nut          | room       | 25%     | Yes     | 8         | Add 7213-NUT-4 listing to vlre-hub            |
| **7213-Nut-Room5**                 | `13044074` | 7213-nut          | room       | 100%    | Yes     | 8         | Add 7213-NUT-5 listing to vlre-hub            |
| **219-pau Front door (new)**       | `25762100` | 219-pau           | front-door | 80%     | Yes     | 5         | Replace old ID in vlre-hub (see §2)           |
| **407-Gev-Loft-official**          | `31136280` | 407-gev           | loft       | 45%     | Yes     | 6         | Replace old ID in vlre-hub (see §2)           |
| **407-GEV-BackDoor**               | `12756118` | 407-gev           | back-door  | 65%     | No      | 8         | Add to 407-GEV-HOME and/or BUNDLE in vlre-hub |
| **5306A-kin-Home**                 | `24572924` | 5306-kin          | unknown    | 55%     | Yes     | 7         | Add entire 5306-KIN property to vlre-hub      |
| **5306-kin-Home Front (PERSONAL)** | `24572672` | 5306-kin          | personal   | 100%    | Yes     | 8         | Add to 5306-KIN property in vlre-hub          |
| **extra VLRE 1.0**                 | `20594524` | unknown           | unknown    | 100%    | No      | 2         | Orphaned — identify or decommission           |
| **Xtra 01**                        | `17052224` | unknown           | unknown    | 100%    | No      | 0         | Orphaned — identify or decommission           |
| **xtra2**                          | `12755968` | unknown           | unknown    | 100%    | No      | 2         | Orphaned — identify or decommission           |

## 4. Unassigned Utility Locks

Locks on Sifely that are pantries, closets, garages, storage, laundry, or patios — not tracked in vlre-hub (may be intentional).

| Lock Alias                     | Lock ID    | Inferred Property | Category |
| ------------------------------ | ---------- | ----------------- | -------- |
| 7213-NUT-Patio                 | `5440142`  | 7213-nut          | patio    |
| Nutria Pantry                  | `5204376`  | 7213-nut          | pantry   |
| 3412-SAN-Garage                | `6726200`  | 3412-san          | garage   |
| 3420-HOV-Garage                | `5814266`  | 3420-hov          | garage   |
| 3420-Hovenweep - Patio         | `5556588`  | 3420-hov          | patio    |
| 271-GIN-Laundry                | `5071172`  | 271-gin           | laundry  |
| 3505-ban Closet supplies       | `18290822` | 3505-ban          | closet   |
| 407-GEV-Pantry                 | `5204692`  | 407-gev           | pantry   |
| 4403B-HAY closet               | `16498846` | 4403-hay          | closet   |
| 4403A-HAY-Closet               | `14077954` | 4403-hay          | closet   |
| 4405A-HAY-Closet               | `13461974` | 4405-hay          | closet   |
| 4410-HAY-Storage               | `7110168`  | 4410-hay          | storage  |
| 5306-kin-Home Patio (PERSONAL) | `24572818` | 5306-kin          | patio    |
| 6002-PAL-Closet                | `13276852` | 6002-pal          | closet   |
| 6002-PAL-LaundryRoom           | `13133106` | 6002-pal          | laundry  |
| 6930-her-closet downstairs     | `28160840` | 6930-her          | closet   |
| 6930-HER-Pantry                | `5204444`  | 6930-her          | pantry   |
| 6930-HER-Garage                | `3564940`  | 6930-her          | garage   |
| 8039-CHE-Garage                | `14404774` | 8039-che          | garage   |

## 5. Locks With Zero Passcodes

Locks assigned to listings (or on Sifely) that have no passcodes — guests cannot use code entry.

| Listing / Property    | Lock Alias           | Lock ID    | Severity                                                           |
| --------------------- | -------------------- | ---------- | ------------------------------------------------------------------ |
| **3505-BAN-\***       | 3505-Ban Front Door  | `16960494` | **CRITICAL** — primary entry point, shared across all BAN listings |
| **4405A-HAY-HOME**    | 4405A-HAY-FrontDoor  | `13329052` | **CRITICAL** — primary entry point                                 |
| 4403B-HAY-HOME        | 4403B-HAY Back door  | `16498856` | Medium                                                             |
| 4403-hay (unassigned) | 4403B-HAY closet     | `16498846` | Low                                                                |
| 4403-hay (unassigned) | 4403A-HAY-Closet     | `14077954` | Low                                                                |
| 6002-pal (unassigned) | 6002-PAL-Closet      | `13276852` | Low                                                                |
| 6002-PAL-HOME         | 6002-PAL-BackDoor    | `13269180` | Medium                                                             |
| 6002-pal (unassigned) | 6002-PAL-LaundryRoom | `13133106` | Low                                                                |
| 7213-NUT-1            | 7213-NUT-Room1       | `13328394` | Medium — room lock                                                 |
| 271-GIN-1             | 271-GIN-Room1        | `5002738`  | Medium — room lock                                                 |
| 271-GIN-3             | 271-GIN-Room3        | `5002746`  | Medium — room lock                                                 |
| 8039-che (unassigned) | 8039-CHE-Garage      | `14404774` | Low                                                                |
| 8039-CHE-HOME         | 8039-CHE-BackDoor    | `14219136` | Medium                                                             |

## 6. Low / Dead Battery

| Listing / Property | Lock Alias          | Lock ID    | Battery | Status                   |
| ------------------ | ------------------- | ---------- | ------- | ------------------------ |
| **219-PAU-HOME**   | 219-PAU-Patio       | `5197968`  | **0%**  | Dead — non-functional    |
| 3420-HOV-\*        | 3420-HOV-FrontDoor  | `5324556`  | 10%     | Critical — will die soon |
| 4403B-HAY-HOME     | 4403B-HAY Back door | `16498856` | 15%     | Low                      |
| 8039-CHE-HOME      | 8039-CHE-BackDoor   | `14219136` | 15%     | Low                      |

## 7. Locks Without Gateway

Without a gateway, locks cannot be managed remotely — passcode changes require Bluetooth proximity.

### Assigned to Listings

| Listing       | Lock Alias         | Lock ID    |
| ------------- | ------------------ | ---------- |
| 271-GIN-\*    | 271-GIN-FrontDoor  | `4831824`  |
| 8039-CHE-HOME | 8039-CHE-Garage    | `14404774` |
| 8039-CHE-HOME | 8039-CHE-BackDoor  | `14219136` |
| 8039-CHE-HOME | 8039-CHE-FrontDoor | `13983660` |

### Unassigned

| Lock Alias       | Lock ID    | Inferred Property |
| ---------------- | ---------- | ----------------- |
| 407-GEV-BackDoor | `12756118` | 407-gev           |
| extra VLRE 1.0   | `20594524` | unknown           |
| Xtra 01          | `17052224` | unknown           |
| xtra2            | `12755968` | unknown           |

**8039-CHE-HOME has zero gateway-connected locks** — the entire property requires on-site Bluetooth for any lock management.

## 8. Missing from vlre-hub

Properties or listings that exist on Sifely and/or Hostfully but are not defined in vlre-hub `properties.json`.

| Property Code | What Exists                                          | What's Missing in vlre-hub           |
| ------------- | ---------------------------------------------------- | ------------------------------------ |
| **5306-kin**  | 3 Sifely locks + 2 Hostfully properties (Bundle + A) | Entire property — no listings at all |
| **7213-nut**  | Rooms 4 & 5 on Sifely with active passcodes          | 7213-NUT-4 and 7213-NUT-5 listings   |
| **407-gev**   | Back door lock on Sifely                             | Lock not assigned to any GEV listing |

## 9. Summary

| Metric                                        | Count                                           |
| --------------------------------------------- | ----------------------------------------------- |
| Total Sifely locks (live)                     | 73                                              |
| vlre-hub listings                             | 40                                              |
| Locks assigned to listings (with Sifely data) | 44                                              |
| Locks assigned but NOT found on Sifely        | 5 (across 4 listings)                           |
| Unassigned locks — non-utility                | 10                                              |
| Unassigned locks — utility                    | 19                                              |
| Orphaned locks (no property match)            | 3                                               |
| Replaced locks (vlre-hub outdated)            | 4                                               |
| Listings without any Sifely data              | 4 (1602-BLU-HOME, 407-GEV-LOFT, + 2 duplicates) |
| Locks with zero passcodes                     | 13                                              |
| Low/dead battery locks (≤20%)                 | 4                                               |
| Locks without gateway                         | 8                                               |
| Properties missing from vlre-hub entirely     | 1 (5306-kin)                                    |
| Listings missing from vlre-hub                | 2 (7213-NUT-4, 7213-NUT-5)                      |
