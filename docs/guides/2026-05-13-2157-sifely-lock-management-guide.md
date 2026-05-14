# Sifely Lock Management Guide

Covers: emergency code restoration, passcode type remediation, API rules, known bugs, and the full property → lock → guest code reference for VLRE.

---

## When to Use This

- A rogue or misbehaving code-rotation run has locked guests out — codes need restoring to what guests were given
- `permanent-visitor-*` passcodes are type 3 (timed) instead of type 2 (permanent) and need to be deleted and recreated
- `create-passcode` or other write operations are returning unexpected errors and you need to diagnose them

---

## Known Bugs in `sifely-client.ts` (All Fixed)

### 1 — Missing `Bearer` prefix on Authorization header

Write operations were missing `Bearer ` on the `Authorization` header. **Fixed.** If write operations fail with HTTP 400 or `code: 401` in the response body, check this first.

```
Authorization: Bearer {token}   ← correct (all operations, reads AND writes)
Authorization: {token}          ← WRONG (was the bug)
```

### 2 — `endDate` field and type-3 code creation

The `endDate` field behavior has changed over time:

- **Phase 1**: `createPasscode` sent `endDate=0` with `keyboardPwdType=2` → Sifely API treated `endDate=0` as a timed-code signal and produced **type 3** codes instead of type 2.
- **Phase 2 (wrong fix)**: `endDate` was omitted entirely → worked briefly, then Sifely changed their API to make `endDate` a **required field**. Omitting it now returns HTTP 500.
- **Phase 3 (current, correct)**: Send `endDate=0` with `keyboardPwdType=2` → produces **type 2 (permanent)** codes. ✅

**Fixed** — `createPasscode` now always sends `endDate=0` for permanent codes.

If creates return HTTP 500 with body `"Required request parameter 'endDate' for method parameter type Long is not present"`, the endDate field is being omitted again — check `sifely-client.ts`.

**Confirmed API behavior (2026-05-13):**

| `keyboardPwdType` | `endDate` sent     | Result                    |
| ----------------- | ------------------ | ------------------------- |
| `2`               | omitted            | HTTP 500 — field required |
| `2`               | `0`                | **Type 2 — permanent ✅** |
| `2`               | any non-zero value | Type 3 — timed            |

### 3 — Stale `date` param on retries

Every Sifely API request requires a `date` field set to the current epoch millisecond. If `params` is built once outside a retry loop and reused, `date` goes stale — Sifely returns 500 on stale timestamps.

**Fixed** — `params` is now built inside the `withRetry` lambda so every attempt uses a fresh `Date.now()`.

---

## Sifely API Rules

- **`addType=1` / `changeType=1` / `deleteType=1`** — universal, works on all locks (gateway-connected and standalone). Always use these.
- **`addType=2`** (push mechanism) only works on locks with an active Sifely gateway hub — avoid. This is entirely distinct from `keyboardPwdType=2`.
- **`keyboardPwdType=2`** (permanent code type) does **not** require a gateway hub — confirmed working on `hasGateway: 0` locks with `addType=1`.
- **HTTP 200 on auth failure** — Sifely returns HTTP 200 even on auth errors for some endpoints. Always check `body.code`, not just the HTTP status.
- **List success omits `code`** — a successful `list-passcodes` response has no `code` field. Presence of `code` in the body means an error.
- HTTP 400 `"failed or means no"` = wrong type value or missing Bearer
- HTTP 400 `"The Device is not connected to any Gateway."` = `addType=2` used on a standalone lock; switch to `addType=1`
- HTTP 200 with `code: 401` in body = auth failure

---

## Diagnosing Type Mismatches

`keyboardPwdType` in each passcode result:

- `1` = one-time
- `2` = **permanent ✅**
- `3` = timed — broken if `endDate=0` in the record

Check a single lock:

```bash
SIFELY_USERNAME=admin@vlrealestate.co \
SIFELY_PASSWORD=<password> \
  npx tsx src/worker-tools/locks/sifely-client.ts \
  --action list-passcodes --lock-id <lock-id>
```

Bulk-audit all locks for any `permanent-visitor-*` code that is not type 2:

```bash
CREDS="SIFELY_USERNAME=admin@vlrealestate.co SIFELY_PASSWORD=<password>"
for lock in <space-separated lock IDs>; do
  result=$(eval "$CREDS npx tsx src/worker-tools/locks/sifely-client.ts --action list-passcodes --lock-id $lock 2>&1")
  bad=$(echo "$result" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      const codes = JSON.parse(d);
      const pv = codes.filter(c => c.keyboardPwdName.startsWith('permanent-visitor'));
      const bad = pv.filter(c => c.keyboardPwdType !== 2);
      if (bad.length > 0) bad.forEach(c => console.log('BAD: ' + c.keyboardPwdName + ' type=' + c.keyboardPwdType + ' id=' + c.keyboardPwdId));
      else console.log('ALL OK (' + pv.length + ' codes)');
    });
  ")
  echo "Lock $lock: $bad"
  sleep 2
done
```

Add `sleep 2` between calls — Sifely rate-limits bulk requests (see Rate Limiting below).

---

## What Is and Isn't a Guest Code

Not every `permanent-visitor-*` passcode is a real guest code. Rogue rotation runs can create codes with unexpected names. Apply this logic before deciding whether to recreate a deleted code:

| Passcode name pattern                                               | Decision                             |
| ------------------------------------------------------------------- | ------------------------------------ |
| `permanent-visitor-home` on the **main FrontDoor** lock             | Real — keep                          |
| `permanent-visitor-room-X` on a **shared front door** lock          | Real — keep (one slot per unit)      |
| `permanent-visitor-room-X` on the **individual room** lock          | Real — keep                          |
| `permanent-visitor-home` on an **individual room** or sub-unit lock | Rogue — delete only, do not recreate |
| `permanent-visitor-1`, `permanent-visitor-2` (no room suffix)       | Rogue — delete only                  |
| `permanent-visitor-bundle`                                          | Rogue — delete only                  |

The canonical guest code is always in the **Hostfully check-in message** sent to the guest.

---

## Restoration Workflow

### Step 1 — Identify affected properties

Only fix properties with **active reservations**. Check Hostfully for current guests.

### Step 2 — Find the guest's code

Check the check-in message sent to the guest in the Hostfully message thread. That code must be on every lock the guest needs to access.

### Step 3 — Update Hostfully `door_code`

```bash
HOSTFULLY_API_KEY=... HOSTFULLY_MOCK='' \
  npx tsx src/worker-tools/locks/update-door-code.ts \
  --property-id <hostfully-uid> --code <code>
```

Verify afterward:

```bash
HOSTFULLY_API_KEY=... npx tsx src/worker-tools/hostfully/get-property.ts --property-id <uid>
```

### Step 4 — Audit each lock

For each lock the guest needs access to, run `list-passcodes` and check **both**:

1. The code **digits** match what the guest was given
2. `keyboardPwdType === 2` (permanent)

Type 3 codes are broken even if the digits are correct — `update-passcode` **cannot change the type**. The only fix is delete and recreate.

### Step 5 — Fix wrong digits (type already 2)

```bash
npx tsx src/worker-tools/locks/sifely-client.ts \
  --action update-passcode --lock-id <X> --passcode-id <Y> --code <ZZZZ>
```

### Step 6 — Fix wrong type (type 3, any digits)

```bash
# Delete first
npx tsx src/worker-tools/locks/sifely-client.ts \
  --action delete-passcode --lock-id <X> --passcode-id <Y>

# Wait 3-5 seconds, then recreate
npx tsx src/worker-tools/locks/sifely-client.ts \
  --action create-passcode --lock-id <X> --name "permanent-visitor-room-N" --code <ZZZZ>
```

The client defaults to permanent (`keyboardPwdType=2`, `endDate=0`) — do not pass `--type`.

### Step 7 — Create missing passcodes

```bash
npx tsx src/worker-tools/locks/sifely-client.ts \
  --action create-passcode --lock-id <X> --name "permanent-visitor-room-N" --code <ZZZZ>
```

`create-passcode` checks for an existing passcode with the same name before creating — it will exit with `{ existed: true }` if already present.

### Step 8 — Verify

Re-run `list-passcodes` and confirm both digits and `keyboardPwdType === 2`.

### Note: `rotate-property-code.ts`

This tool only manages the `permanent-visitor-home` named passcode. **Do not use it** for:

- Properties not in `property_locks`
- Buildings with a shared front door (it will overwrite the shared door with the wrong code)
- Fixing type-3 codes (it does not check or fix `keyboardPwdType`)

---

## `hasGateway` and Remote Code Creation

`list-locks` returns a `hasGateway` field per lock:

- `hasGateway: 1` — gateway connected; remote code creation works
- `hasGateway: 0` — no gateway; requires Bluetooth proximity to sync new codes

**HTTP 500 from `create-passcode` is not necessarily a gateway issue.** During the 2026-05-13 incident, all create calls were returning 500 because `endDate` was missing from the request — including gateway-connected locks. Always check the raw response body before assuming a gateway problem.

To check lock metadata including `hasGateway`:

```bash
npx tsx src/worker-tools/locks/sifely-client.ts --action list-locks
```

---

## Rate Limiting and Retry Behavior

**Rate limiting (HTTP 429)**: Sifely limits bulk API calls. Symptoms: `Sifely listPasscodes HTTP error: 429`, `Sifely deletePasscode HTTP error: 429`. Add `sleep 2` to `sleep 5` between sequential calls. `withRetry` does **not** retry 429s — if you hit one, wait a few seconds and re-run manually.

**`withRetry` in `sifely-client.ts`** wraps `create-passcode` with exponential backoff:

- Max attempts: 5
- Base delay: 2 s (doubles each attempt: 2 s, 4 s, 8 s, 16 s)
- Retryable: any error message matching `/\b5\d{2}\b/` (HTTP 5xx)
- Not retried: 429, auth errors, 4xx validation errors

If all 5 attempts return 500, inspect the raw response body — it contains the actual error message from the Sifely server.

---

## Raw API Test Script

When the CLI tool is returning 500 and the error message isn't descriptive enough, use this script to see the full raw Sifely response:

```typescript
// Save as /tmp/test-sifely.mts and run:
// SIFELY_USERNAME=... SIFELY_PASSWORD=... npx tsx /tmp/test-sifely.mts
const loginParams = new URLSearchParams({
  client_id: 'VLRE',
  username: process.env.SIFELY_USERNAME!,
  password: process.env.SIFELY_PASSWORD!,
  date: String(Date.now()),
});
const r = await fetch('https://app-smart-server.sifely.com/system/smart/login?' + loginParams, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json;charset=UTF-8',
    Origin: 'https://manager.sifely.com',
    Referer: 'https://manager.sifely.com/',
    isToken: 'false',
  },
});
const body = (await r.json()) as any;
const token = body.data.token;
console.log('Token:', token.slice(0, 20) + '...');

const cp = new URLSearchParams({
  lockId: '<lock-id>',
  keyboardPwd: '<code>',
  keyboardPwdName: '<name>',
  keyboardPwdType: '2',
  startDate: String(Date.now()),
  endDate: '0',
  addType: '1',
  date: String(Date.now()),
});
const cr = await fetch('https://app-smart-server.sifely.com/v3/keyboardPwd/add?' + cp, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token },
});
console.log('Status:', cr.status, cr.statusText);
console.log('Body:', await cr.text());
```

---

## Property → Lock Mapping

Use the `property_locks` DB table as the source of truth:

```sql
SELECT property_external_id, lock_external_id, lock_name
FROM property_locks
WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
ORDER BY property_external_id;
```

**Properties NOT in `property_locks`** (handle manually):

| Property           | Locks                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| `3420-HOV-2`       | Shares HOV's locks; use `permanent-visitor-room-2` passcode name      |
| `3412-SAN-1/2/3/4` | Share SAN-HOME's locks; use `permanent-visitor-room-X` passcode names |
| `4410B-HAY-HOME`   | Front door `8289650`, back door `11767100`                            |
| `7213-NUT-1`       | Front door `3391760`, room door `13328394`                            |

**Shared front doors** (one lock, multiple units, each with its own passcode name slot):

| Building       | Shared front door lock | Passcode name pattern                       |
| -------------- | ---------------------- | ------------------------------------------- |
| GIN (271-GIN)  | `4831824`              | `permanent-visitor-room-1` through `room-4` |
| SAN (3412-SAN) | `5804542`              | `permanent-visitor-room-1` through `room-4` |
| HOV (3420-HOV) | `5324556`              | `permanent-visitor-room-X` per unit         |

---

## Lock → Property → Guest Code Reference (Active Reservations 2026-05-13)

All locks verified clean (all `permanent-visitor-*` codes confirmed type 2) as of end of 2026-05-13.

| Property       | Guest                | Code | Locks                                                                                   |
| -------------- | -------------------- | ---- | --------------------------------------------------------------------------------------- |
| 3401-BRE-HOME  | Joseph 宗榮          | 8686 | 5447540 (FrontDoor), 4302846 (Patio), 4318724 (Room1), 4318628 (Room2), 4318552 (Room3) |
| 219-PAU-HOME   | Layla Garza          | 0206 | 25762100 (FrontDoor), 5197968 (Patio)                                                   |
| 271-GIN-1      | Josh Mendiola-Garcia | 3453 | 5002738 (Room1), 4831824 (FrontDoor — room-1 slot)                                      |
| 271-GIN-3      | Kevin Munck          | 5071 | 5002746 (Room3), 4831824 (FrontDoor — room-3 slot)                                      |
| 3412-SAN-1     | Daniel Valdez        | 8642 | 3531740 (Room1), 5804542 (FrontDoor — room-1 slot)                                      |
| 3412-SAN-2     | Alexandro Rodriguez  | 1057 | 3531698 (Room2), 5804542 (FrontDoor — room-2 slot)                                      |
| 3412-SAN-3     | Benjamin Botello     | 0912 | 3531784 (Room3), 5804542 (FrontDoor — room-3 slot)                                      |
| 3412-SAN-4     | Jonathan Arteaga     | 8042 | 3531802 (Room4), 5804542 (FrontDoor — room-4 slot)                                      |
| 3420-HOV-2     | (guest)              | 0706 | 3629734 (Room2), 5324556 (FrontDoor — room-2 slot)                                      |
| 3505-BAN-HOME  | (guest)              | 7403 | 16960494 (FrontDoor), 12326642 (Room1), 12326372 (Room2), 12326446 (Room3)              |
| 7213-NUT-1     | (guest)              | 2959 | 3391760 (FrontDoor), 13328394 (Room1)                                                   |
| 4410B-HAY-HOME | Marcos Pacheco       | 6904 | 8289650 (FrontDoor), 11767100 (BackDoor)                                                |

---

## Incident Log — What Was Changed (2026-05-13)

| Lock                  | Passcode name              | Code  | Action                     | Reason                                                                |
| --------------------- | -------------------------- | ----- | -------------------------- | --------------------------------------------------------------------- |
| 4302846 BRE Patio     | `permanent-visitor-1`      | 5200  | Deleted only               | Rogue code — no guest uses it                                         |
| 4302846 BRE Patio     | `permanent-visitor-2`      | 2855  | Deleted only               | Rogue code — no guest uses it                                         |
| 4831824 GIN FrontDoor | `permanent-visitor-room-2` | 45254 | Deleted + recreated type 2 | Was type 3                                                            |
| 4831824 GIN FrontDoor | `permanent-visitor-room-4` | 3232  | Deleted + recreated type 2 | Was type 3                                                            |
| 4831824 GIN FrontDoor | `permanent-visitor-room-1` | 3453  | Created type 2             | Was missing (deleted in prior session)                                |
| 4831824 GIN FrontDoor | `permanent-visitor-room-3` | 5071  | Created type 2             | Was missing (deleted in prior session)                                |
| 5002738 GIN Room1     | `permanent-visitor-room-1` | 3453  | Created type 2             | Was missing                                                           |
| 5002746 GIN Room3     | `permanent-visitor-room-3` | 5071  | Created type 2             | Was missing                                                           |
| 5804542 SAN FrontDoor | `permanent-visitor-home`   | 52025 | Deleted only               | Rogue code on shared front door; room-slot codes were already correct |
| 12326642 BAN Room1    | `permanent-visitor-home`   | 7403  | Deleted only               | Rogue code on room lock; real home code lives on FrontDoor (16960494) |
| 8289650 HAY FrontDoor | `permanent-visitor-bundle` | 80912 | Deleted only               | Rogue code; `permanent-visitor-home` (6904) was already type 2        |
| 11767100 HAY BackDoor | `permanent-visitor-bundle` | 80912 | Deleted only               | Rogue code; `permanent-visitor-home` (6904) was already type 2        |

---

## Environment Variables and Credentials

All of the following must be set when running tools locally:

```
SIFELY_USERNAME=admin@vlrealestate.co
SIFELY_PASSWORD=<from tenant_secrets>
HOSTFULLY_API_KEY=<from tenant_secrets>
HOSTFULLY_MOCK=''          ← must be explicitly empty string to disable mock mode
SUPABASE_URL=http://localhost:54331
SUPABASE_SECRET_KEY=<from tenant_secrets>
TENANT_ID=00000000-0000-0000-0000-000000000003
```

Sifely credentials are stored as tenant secrets in the database, not in `.env`. Retrieve them with the helper script:

```bash
npx tsx scripts/get-sifely-creds.ts
```

Or query all tenant secrets directly:

```bash
curl -s "http://localhost:54331/rest/v1/tenant_secrets?tenant_id=eq.00000000-0000-0000-0000-000000000003&select=key,value" \
  -H "Authorization: Bearer <SUPABASE_SECRET_KEY>" -H "apikey: <SUPABASE_SECRET_KEY>"
```

Or via psql:

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT key, value FROM tenant_secrets WHERE tenant_id = '00000000-0000-0000-0000-000000000003' AND key LIKE 'sifely%';"
```

---

## Related Files

| File                                             | Purpose                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `src/worker-tools/locks/sifely-client.ts`        | Primary Sifely API shell tool — list, create, update, delete passcodes |
| `src/worker-tools/locks/rotate-property-code.ts` | Automated rotation — manages `permanent-visitor-home` codes only       |
| `src/worker-tools/locks/generate-code.ts`        | Generates memorable lock codes (ABBA/ABAB patterns)                    |
| `src/worker-tools/locks/update-door-code.ts`     | Updates Hostfully `door_code` field only — no Sifely interaction       |
| `scripts/get-sifely-creds.ts`                    | Decrypts and prints Sifely credentials from `tenant_secrets`           |

## Reference: Old VLRE App

If Sifely API behavior is ever unclear, the working reference implementation is at:

```
/Users/victordozal/repos/real-estate/old/vlre-apps-2025-10-07/apps/api/src/sifely/
```

Key files: `sifely-passcodes.service.ts`, `sifely-request.service.ts`
