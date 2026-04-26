# HF-02b: Get All Properties Shell Tool

## TL;DR

> **Quick Summary**: Create a shell tool at `src/worker-tools/hostfully/get-properties.ts` that fetches all properties for a VLRE agency from the Hostfully API, returning a curated JSON array to stdout. Uses cursor-based pagination with dedup guard.
>
> **Deliverables**:
>
> - `src/worker-tools/hostfully/get-properties.ts` — CLI script, cursor pagination, curated JSON array
> - `tests/worker-tools/hostfully/get-properties.test.ts` — mock unit tests with local HTTP server
> - Dockerfile updated with 1 COPY line
> - Live API smoke test against real VLRE agency

## API Research (confirmed via live calls 2026-04-22)

- Endpoint: `GET /api/v3.2/properties?agencyUid={uid}`
- Response: `{ properties: [...], _metadata: { count, totalCount: null }, _paging: { _limit: 20, _nextCursor: "<base64>" } }`
- Pagination: cursor passed as `cursor=<base64>` query param (URL-encode it)
- **VLRE has 20 properties** — all fit in one page
- `_nextCursor` is always returned even when no more data (API quirk) → termination by dedup (seenUids Set)
- Address is nested object: `{ address, address2, city, state, zipCode, countryCode, longitude, latitude }`
- `isActive` is a top-level boolean field
- `availability.maxGuests` for capacity

## TODOs

- [x] 1. Create get-properties.ts shell tool + mock unit tests
- [x] 2. Update Dockerfile to copy get-properties.js
- [x] 3. Build verification + test suite + Docker image validation
- [x] 4. Live API smoke test against real VLRE agency

## Final Verification Wave

- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high
- [x] F4. Scope Fidelity Check — deep
