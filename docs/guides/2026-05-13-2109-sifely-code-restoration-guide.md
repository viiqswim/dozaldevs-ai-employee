# Sifely Lock Code Restoration Guide

## When to Use This

A rogue (or misbehaving) code-rotation employee rotates lock codes across VLRE properties. Guests are locked out. You need to restore every affected lock back to the code each guest was given.

---

## The One Critical Bug (Now Fixed)

`sifely-client.ts` write operations were missing `Bearer ` on the `Authorization` header. **This is now fixed.** If write operations ever fail again with HTTP 400 or `code: 401`, check this first.

```
Authorization: Bearer {token}   ← correct (all operations, reads AND writes)
Authorization: {token}          ← WRONG (was the bug)
```

---

## Sifely API Rules

- **`addType=1` / `changeType=1` / `deleteType=1`** — universal, works for all locks (gateway-connected and standalone)
- **Type 2** variants only work on locks with an active Sifely gateway hub — avoid
- List passcodes uses `Bearer` too; it always did — that was never the issue
- HTTP 400 `"failed or means no"` = wrong type value or missing Bearer
- HTTP 400 `"The Device is not connected to any Gateway."` = you used type=2 on a standalone lock; switch to type=1
- HTTP 200 with `code: 401` in body = auth failure (Sifely returns 200 even on auth errors for some endpoints)

---

## Property → Lock Mapping

Use the `property_locks` DB table as the source of truth:

```sql
SELECT property_external_id, lock_external_id, lock_name
FROM property_locks
WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
ORDER BY property_external_id;
```

**Properties NOT in `property_locks`** (must handle manually):

- `3420-HOV-2` — shares HOV's locks; use per-unit `permanent-visitor-room-2` passcode name
- `3412-SAN-1/2/4` — share SAN-HOME's locks; use per-unit `permanent-visitor-room-X` passcode names
- `4410B-HAY-HOME` — front door `8289650`, back door `11767100`
- `7213-NUT-1` — front door `3391760`, room door `13328394`

**Shared front doors** (one lock, multiple units, each with its own passcode name):

- GIN building: lock `4831824` — passcode names `permanent-visitor-room-1` through `permanent-visitor-room-4`
- SAN building: lock `5804542` — same pattern
- HOV building: lock `5324556` — same pattern

---

## Guest Code Source of Truth

Guest codes come from **Hostfully message threads** — check the check-in message sent to the guest. The code in that message is what must be on every lock the guest needs to access.

Hostfully `door_code` field must also match — update it with:

```bash
HOSTFULLY_API_KEY=... HOSTFULLY_MOCK='' npx tsx src/worker-tools/locks/update-door-code.ts \
  --property-id <hostfully-uid> --code <code>
```

---

## Restoration Workflow

### Step 1 — Identify affected properties

Only fix properties with **active reservations today**. Check Hostfully for current guests.

### Step 2 — For each property

1. Find guest code from Hostfully message thread
2. Update Hostfully `door_code` via `update-door-code.ts`
3. List current passcodes on each lock via `sifely-client.ts --action list-passcodes`
4. For each lock, find the relevant passcode by name and check if code matches
5. Update wrong codes: `sifely-client.ts --action update-passcode --lock-id X --passcode-id Y --code ZZZZ`
6. Create missing passcodes: `sifely-client.ts --action create-passcode --lock-id X --name "..." --code ZZZZ`
7. Verify with another `list-passcodes` call

### Step 3 — Use `rotate-property-code.ts` only when appropriate

It only manages the `permanent-visitor-home` named passcode. **Do not use it** for:

- Properties not in `property_locks`
- Buildings with a shared front door (it will overwrite the shared door with the wrong code)

### Step 4 — Verify Hostfully

```bash
# Confirm door_code is set correctly
HOSTFULLY_API_KEY=... npx tsx src/worker-tools/hostfully/get-property.ts --property-id <uid>
```

---

## Environment Variables Required

All must be set when running tools locally:

```
SIFELY_USERNAME=admin@vlrealestate.co
SIFELY_PASSWORD=<from tenant_secrets>
HOSTFULLY_API_KEY=<from tenant_secrets>
HOSTFULLY_MOCK=''          ← must be explicitly empty string to disable mock mode
SUPABASE_URL=http://localhost:54331
SUPABASE_SECRET_KEY=<from tenant_secrets>
TENANT_ID=00000000-0000-0000-0000-000000000003
```

Retrieve secrets from DB:

```bash
curl -s "http://localhost:54331/rest/v1/tenant_secrets?tenant_id=eq.00000000-0000-0000-0000-000000000003&select=key,value" \
  -H "Authorization: Bearer <SUPABASE_SECRET_KEY>" -H "apikey: <SUPABASE_SECRET_KEY>"
```

---

## Reference: Old VLRE App

If Sifely API behavior is ever unclear, the working reference implementation is at:

```
/Users/victordozal/repos/real-estate/old/vlre-apps-2025-10-07/apps/api/src/sifely/
```

Key files: `sifely-passcodes.service.ts`, `sifely-request.service.ts`
