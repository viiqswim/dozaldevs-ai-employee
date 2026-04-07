
## 2026-04-07 T13: Fly→ngrok connectivity failure

**Issue:** Fly.io machines in DFW region cannot connect to ngrok free-tier tunnel URLs.

**Symptom:**
- Worker entrypoint step 6 exits with code 7 (curl CURLE_COULDNT_CONNECT)
- Zero connections through ngrok tunnel despite it being up and reachable from local Mac
- Exit is immediate (same-second as step start), confirming TCP connection refused

**Impact:** Happy-path E2E cannot complete. Task gets stuck in `Executing` state.

**Possible causes:**
1. ngrok free tier blocks Fly.io cloud egress IPs
2. Network routing issue between Fly DFW and ngrok's AWS us-east-2 ingress
3. ngrok rate limit on free tier (though 0 connections were registered)

**Workaround ideas (need code changes):**
- Use `--max-time 10` and capture curl exit code explicitly in entrypoint, not relying on `set -e` propagation
- Try a different ngrok plan or alternative tunnel service (Cloudflare Tunnel, ngrok Pro)
- Test from a different Fly region (sjc vs dfw)
- Add `ngrok-skip-browser-warning: true` header to curl calls (though not a TCP issue)
- Unset `set -e` around the curl call and explicitly check HTTP code
