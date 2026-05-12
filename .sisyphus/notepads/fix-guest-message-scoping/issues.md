# Issues — fix-guest-message-scoping

## [2026-05-12] Plan initialized — no issues yet

## [2026-05-12] E2E Guest Name Mismatch

### Issue
Guest name in approval card shows "c.e." (Hostfully API response) but test expectation is "Olivia" (actual account name).

### Lead
- Lead UID: 29a64abd-d02c-44bc-8d5c-47df58a7ab14
- Hostfully firstName: "c.e." (Airbnb anonymized alias)
- Expected by test: "Olivia"

### Behavior
- `get-messages.ts` calls Hostfully API `GET /leads/{leadId}`
- API returns `guestInformation.firstName = "c.e."` and `guestInformation.lastName = ""` (or null)
- `formatGuestName()` returns "c.e."
- This is passed to `post-guest-approval.ts --guest-name "c.e."`
- Approval card shows "Guest: c.e."

### Impact
- Lead scoping fix IS working (correct lead fetched)
- Test criterion "must show Olivia" FAILS
- NOT approved per test instructions

### Possible Resolutions
1. Update test expectation to "c.e." since that's what Hostfully returns
2. Check if Hostfully has updated guest info (after booking confirmed, Airbnb reveals real name)
3. Verify if Hostfully stores "Olivia" under a different field

### Status
OPEN — needs investigation by repo owner
