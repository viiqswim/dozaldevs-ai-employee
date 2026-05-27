## [2026-05-27] Batches 1-5 Complete — Key Findings

### Pass Rate (Batches 1-5)
- Batch 1: 10/10 PASS
- Batch 2: 9/10 PASS (1 FAIL)
- Batch 3: 8/10 PASS (2 FAILs)
- Batch 4: 9/10 PASS (1 FAIL)
- Batch 5: 10/10 PASS
- **Total: 46/50 PASS (92%)**

### Failure Pattern
All 4 failures are EXECUTION phase failures, NOT delivery phase failures:
- Classification: `NO_DELIVERY_LOG` — task status is "Failed", no delivery container ever ran
- Error message: "submit-output still not found after recovery nudge — task failed"
- Duration: 61–152s (much shorter than typical 168–258s)
- Root cause: 30s execution idle timeout fires → recovery nudge sent → LLM doesn't call submit-output within 10s post-nudge window → task marked Failed
- These are NOT consecutive failures (scattered across batches) — no emergency stop triggered
- The DELIVERY fix (120s timeout) is working: every task that completed execution successfully posted to Slack (0 delivery failures in 50 runs)

### Docker Health (after batches 2 and 4)
- Exited containers: 31 (consistent — same count both checks)
- Docker SHA: sha256:2961ea8894cf59ecafae1ba58d8339c0bd9b550a2cc1681daa1d13d59379e8e0 ✅ UNCHANGED

### Credits After 50 Runs
- Started: $3.79
- After batch 5: $3.59
- Consumed: ~$0.20 for 50 runs (~$0.004/run)
- Remaining for 50 more runs: $3.59 — more than sufficient

### Slow Runs
- bed6d54f (batch 3): 365s [SLOW] — entered Delivering before 300s window, completed late; PASS
- 9b3c0efd (batch 5): 228s — within normal range
- 4a5e185f (batch 5): 178s — within normal range

### Batch 5 Note
Batch 5 was triggered by the Task 2 subagent just before poll timeout (30 min).
Verification was completed by Atlas orchestrator directly via DB queries + delivery log checks.
All 10/10 passed three-part verification.

## Statistical Report — 2026-05-27

### Key Findings
- 95/100 pass rate (95.0%) → VERDICT: FIX LIKELY WORKS
- All 5 failures are execution-phase idle timeout (pre-existing issue, not delivery-related)
- Delivery fix (120s timeout) = 100% effective — 0 delivery failures in 100 runs
- Duration stats (PASS-only): p50=169s, p95=228s, Max=365s, Mean=184s
- 1 slow run: bed6d54f at 365s (PASS)
- Wilson 95% CI: [88.82%, 97.85%] — lower bound below 95%, statistical uncertainty remains
- Batch trend: no degradation over time; batch 3 had highest failure rate (2/10)
- Docker SHA unchanged throughout: sha256:2961ea8894cf...
- Cost: $0.41 for 100 runs ($0.004106/run)

### Next Step Recommendation
Apply 120s timeout fix to execution phase (same pattern as delivery fix) to address remaining 5 failures.
