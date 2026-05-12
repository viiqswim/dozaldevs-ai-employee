# External API Integration Practices

> Extracted from a multi-session debugging incident where the Hostfully `GET /leads/{uid}` response envelope caused the wrong guest name to appear on Slack approval cards. The fix was two lines; finding it took several sessions. These rules exist so that does not happen again.

## Rule 1 — Raw response first

When any API integration produces wrong or missing data, **step 1 is always a direct live request** to inspect the raw JSON. Not reading code, not adding application logs — a curl or `node -e` call to the actual endpoint.

```bash
# Do this BEFORE reading application code
node -e "
const res = await fetch('https://api.hostfully.com/v3.2/leads/{uid}', {
  headers: { 'X-API-KEY': process.env.HOSTFULLY_API_KEY }
});
const json = await res.json();
console.log('Top-level keys:', Object.keys(json));
console.log(JSON.stringify(json, null, 2));
"
```

This one command would have resolved the Hostfully incident in under five minutes. It revealed `Top-level keys: [ 'lead' ]` immediately, pointing directly at the unwrapping bug.

**Applied to**: any wrong/missing value from an external API call. Start here before anything else.

---

## Rule 2 — Never bare `as T` on raw API JSON

TypeScript's `as T` cast is silent at runtime. `const lead = (await res.json()) as RawLead` compiles and runs without error even when `res.json()` returns `{ lead: {...} }`. No exception is thrown. The wrong shape propagates silently.

**Instead**, use a wrapper-aware cast or runtime validation:

```typescript
// Option A: Zod (validates shape at runtime — best for critical paths)
const lead = RawLeadSchema.parse(await res.json());

// Option B: Wrapper-aware cast (what this codebase uses — acceptable)
const json = (await res.json()) as { lead?: RawLead };
const lead = json.lead ?? (json as unknown as RawLead);

// Option C: Minimum viable guard (add a warning log at least)
const json = (await res.json()) as Record<string, unknown>;
if (!json.guestInformation) {
  logger.warn('Unexpected API response shape', { keys: Object.keys(json) });
}
```

The bare `as T` antipattern should be treated as a bug at any external API boundary.

---

## Rule 3 — Expect and document the response envelope

Many REST APIs wrap single-resource responses in an envelope. Hostfully does this consistently:

| Endpoint type   | Shape                    | Example                                      |
| --------------- | ------------------------ | -------------------------------------------- |
| Single resource | `{ "resource": {...} }`  | `{ "lead": {...} }`, `{ "property": {...} }` |
| Collection      | `{ "resources": [...] }` | `{ "leads": [...] }`                         |

This asymmetry between single-resource and list endpoints is common across many APIs (Stripe, Twilio, HubSpot, etc.). Always verify **both** shapes before writing parsing code — they are often different.

**Document the envelope shape in a comment at the parse site the moment you discover it:**

```typescript
// Hostfully single-resource endpoints wrap responses: { "lead": {...} }, { "property": {...} }
// List endpoints return arrays under a plural key: { "leads": [...] }
// Reference: https://developers.hostfully.com/reference
const json = (await res.json()) as { lead?: RawLead };
const lead = json.lead ?? (json as unknown as RawLead);
```

This comment prevents the next developer from making the same mistake.

---

## Rule 4 — Existing codebase patterns document known API quirks

When you see a seemingly redundant pattern at an API boundary — especially a `?? fallback`, a field rename, or a try/catch around a specific call — treat it as documentation of a known quirk left by whoever hit the problem first.

**In this codebase**: `hostfully-enrichment.ts` already had the property unwrap:

```typescript
const propertyJson = (await propRes.json()) as { property?: {...}; name?: string };
const property = propertyJson.property ?? propertyJson;
```

This pattern was the answer to the lead name bug — it just wasn't applied to the lead endpoint. Before writing new code for any existing API integration, scan the file for existing patterns and ask: "Why does this exist? Does the same reason apply to what I'm adding?"

---

## Rule 5 — Make critical null a loud failure, not a silent one

Silent null propagation is the root of hard-to-trace data quality bugs. The Hostfully incident failed silently across four steps:

1. `lead.guestInformation` → `undefined` (wrong shape, no error)
2. `formatGuestName(undefined)` → `null` (no error)
3. Model received `guestName: null` (no error)
4. Model extracted name from conversation text → wrong name (no error)

A single warning log at step 1 would have pointed directly at the cause on the first run.

**At API boundaries, log when critical fields are missing:**

```typescript
const lead = json.lead ?? (json as unknown as RawLead);
if (!lead.guestInformation) {
  logger.warn('lead.guestInformation missing — API response shape may have changed', {
    leadUid,
    topLevelKeys: Object.keys(json),
  });
}
```

---

## Rule 6 — Add an API shape smoke test when onboarding a new endpoint

When adding a new external API endpoint, add a lightweight integration test that verifies the live API returns the shape the parsing code expects. This catches envelope surprises at integration time, not in production.

```typescript
// tests/integration/hostfully-api-shapes.test.ts
it('GET /leads/:uid returns { lead: {...} } envelope', async () => {
  const res = await fetch(`${BASE}/leads/${TEST_LEAD_UID}`, { headers });
  const json = await res.json();
  expect(json).toHaveProperty('lead');
  expect(json.lead).toHaveProperty('guestInformation');
});
```

Keep these in a separate `tests/integration/` suite that runs manually or against a staging environment — not in CI — since they require live credentials.

---

## Quick-reference checklist

```
□ Inspect raw API response FIRST — curl or node -e before reading application code
□ No bare `as T` on API JSON — use wrapper-aware cast or Zod
□ Comment the envelope shape at the parse site
□ Verify single-resource AND collection shapes — they are often different
□ Scan existing file patterns before adding new API calls — they document quirks
□ Log a warning if critical fields come back null/undefined
□ Add a shape smoke test when onboarding a new endpoint
```
