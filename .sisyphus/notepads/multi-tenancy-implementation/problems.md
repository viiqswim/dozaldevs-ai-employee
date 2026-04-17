# Unresolved Problems — multi-tenancy-implementation

## [2026-04-16] F3 — Real Manual QA (2-Org Proof): BLOCKED — Human Gate

**Status**: Intentionally blocked. Cannot proceed without user action.

**Why blocked**:

- `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` are NOT set in `.env`
- No Cloudflare Tunnel URL configured as `SLACK_REDIRECT_BASE_URL`
- DozalDevs OAuth flow requires a human to complete in a browser
- Plan explicitly states: "Do NOT auto-proceed after verification. Wait for user's explicit approval."

**What the user must do to unblock**:

1. Add to `.env`:
   - `SLACK_CLIENT_ID=<from api.slack.com/apps>`
   - `SLACK_CLIENT_SECRET=<from api.slack.com/apps>`
   - `SLACK_REDIRECT_BASE_URL=<cloudflare-tunnel-url>`
2. Run: `cloudflared tunnel --url http://localhost:3000`
3. Run: `pnpm setup:two-tenants`
4. Complete DozalDevs OAuth in browser: `http://localhost:3000/slack/install?tenant=00000000-0000-0000-0000-000000000002`
5. Trigger both summarizers and verify Slack digests appear
6. Tell Atlas "okay" — F3 will be marked complete and plan closed

**This is NOT a code bug. It is a deliberate human-in-the-loop gate.**
