# Decisions — invitation-accept-fix

## [2026-06-16] DR-1: Harden ensureUserExists for concurrency (ACCEPTED — load-bearing)

The "single creator" invariant is only true if the one writer survives concurrent first-touch.
On a new user's first sign-in, `/me` and `/me/tenants` fire in parallel and both call `ensureUserExists`
for a not-yet-existing row; the plain `upsert` lets one insert win and the other throw P2002 → 401.
Fix: catch P2002, re-fetch the same identity, return it. This is the keystone.

## [2026-06-16] DR-2: Single-atomic "complete-invite" endpoint (CONSIDERED — REJECTED)

Conflicts with the single-writer invariant. Idempotency + concurrency-safe ensureUserExists buys
the same robustness without a new endpoint. Only revisit if: high invitation volume OR non-browser client.
Do NOT frame as an inevitable "scale end-state."
