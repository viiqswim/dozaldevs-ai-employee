# Lock & Property Discrepancy Report

> Generated 2026-05-13 from `property-lock-passcode-map.json` — a cross-reference of Sifely locks, Hostfully properties, and passcodes across all 16 VL Real Estate properties.

## 1. Hostfully Properties Without Locks

Properties that exist in Hostfully but have zero Sifely locks associated.

| Property Code | Hostfully Name | Hostfully UID                          | Notes                                        |
| ------------- | -------------- | -------------------------------------- | -------------------------------------------- |
| 1602-blu      | 1602-BLU-HOME  | `dac5a0e0-3984-4f72-b622-de45a9dd758f` | Colorado property — no smart locks installed |

## 2. Orphaned Sifely Locks (No Property Match)

Locks on the Sifely account that can't be matched to any property by name. All three lack a gateway (no remote control).

| Lock Alias     | Lock ID    | MAC Address         | Battery | Passcodes                    |
| -------------- | ---------- | ------------------- | ------- | ---------------------------- |
| extra VLRE 1.0 | `20594524` | `98:21:9C:AC:FF:4D` | 100%    | 2 (extra:`0904`, vyo:`1808`) |
| Xtra 01        | `17052224` | `32:EE:03:E5:47:08` | 100%    | 0                            |
| xtra2          | `12755968` | `C5:3A:05:4D:3B:87` | 100%    | 2 (extra:`1096`, vyo:`1808`) |

These appear to be spare or test locks. The "vyo" passcode appears on two of them.

## 3. Locks With Zero Passcodes

These locks are installed on properties but have no passcodes configured — guests cannot access these doors via code entry.

| Property     | Lock Alias           | Lock ID    | Severity                           |
| ------------ | -------------------- | ---------- | ---------------------------------- |
| **3505-ban** | 3505-Ban Front Door  | `16960494` | **CRITICAL** — primary entry point |
| **4405-hay** | 4405A-HAY-FrontDoor  | `13329052` | **CRITICAL** — primary entry point |
| 4403-hay     | 4403B-HAY Back door  | `16498856` | Medium                             |
| 4403-hay     | 4403B-HAY closet     | `16498846` | Low                                |
| 4403-hay     | 4403A-HAY-Closet     | `14077954` | Low                                |
| 6002-pal     | 6002-PAL-Closet      | `13276852` | Low                                |
| 6002-pal     | 6002-PAL-BackDoor    | `13269180` | Medium                             |
| 6002-pal     | 6002-PAL-LaundryRoom | `13133106` | Low                                |
| 7213-nut     | 7213-NUT-Room1       | `13328394` | Medium — room lock                 |
| 271-gin      | 271-GIN-Room1        | `5002738`  | Medium — room lock                 |
| 271-gin      | 271-GIN-Room3        | `5002746`  | Medium — room lock                 |
| 8039-che     | 8039-CHE-Garage      | `14404774` | Low                                |
| 8039-che     | 8039-CHE-BackDoor    | `14219136` | Medium                             |

**13 locks** across 7 properties have no passcodes at all. The two front doors (3505-ban, 4405-hay) are the highest priority — guests rely on these for entry.

## 4. Low / Dead Battery

| Property    | Lock Alias          | Lock ID    | Battery | Status                   |
| ----------- | ------------------- | ---------- | ------- | ------------------------ |
| **219-pau** | 219-PAU-Patio       | `5197968`  | **0%**  | Dead — non-functional    |
| 3420-hov    | 3420-HOV-FrontDoor  | `5324556`  | 10%     | Critical — will die soon |
| 4403-hay    | 4403B-HAY Back door | `16498856` | 15%     | Low                      |
| 8039-che    | 8039-CHE-BackDoor   | `14219136` | 15%     | Low                      |

The 219-pau Patio lock at 0% is effectively dead and cannot accept or validate passcodes.

## 5. Locks Without Gateway

Without a Sifely gateway, these locks cannot be managed remotely — passcode changes require physical Bluetooth proximity to the lock.

### Property Locks

| Property | Lock Alias         | Lock ID    |
| -------- | ------------------ | ---------- |
| 271-gin  | 271-GIN-FrontDoor  | `4831824`  |
| 407-gev  | 407-GEV-BackDoor   | `12756118` |
| 8039-che | 8039-CHE-Garage    | `14404774` |
| 8039-che | 8039-CHE-BackDoor  | `14219136` |
| 8039-che | 8039-CHE-FrontDoor | `13983660` |

### Orphaned Locks

| Lock Alias     | Lock ID    |
| -------------- | ---------- |
| extra VLRE 1.0 | `20594524` |
| Xtra 01        | `17052224` |
| xtra2          | `12755968` |

**8039-che has zero gateway-connected locks** — the entire property requires on-site Bluetooth for any lock management.

## 6. Summary

| Metric                           | Count                           |
| -------------------------------- | ------------------------------- |
| Total Sifely locks               | 73                              |
| Locks matched to properties      | 70                              |
| Orphaned locks (no property)     | 3                               |
| Properties with locks            | 15                              |
| Properties without locks         | 1 (1602-blu)                    |
| Locks with zero passcodes        | 13                              |
| Low/dead battery locks (≤20%)    | 4                               |
| Locks without gateway            | 8 (5 on properties, 3 orphaned) |
| Total Hostfully property entries | 45 (top-level + sub-units)      |
