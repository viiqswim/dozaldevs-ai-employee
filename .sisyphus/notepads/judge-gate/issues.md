# Judge Gate — Issues

(None yet — populated as issues are discovered)

## [2026-04-13T16:39] Run 5 Failure — 422 PR Creation + Zero Code Changes

### Root Cause
- Both waves logged "no changes to commit this wave" — OpenCode ran but wrote ZERO code
- Branch `ai/TEST-1776093867-...` was never pushed to GitHub (git-push-final was 9ms no-op)
- GitHub returned 422 on PR creation because branch doesn't exist / no commits ahead of main
- trigger-task exited EXIT_CODE:0 but with "No PR URL found in deliverables table"

### Judge Gate Status in Run 5
- Judge ran: YES (`plan-judge: API unavailable, defaulting to PASS`)
- Judge actually verified plan: NO (OpenRouter API unavailable from Fly machine)
- This is correct PASS-on-failure behavior — judge gate code is working correctly

### Why OpenCode Made No Changes
- MiniMax M2.7 marked 6 tasks complete in plan file without implementing any code
- This is the exact instruction-following failure the judge gate is designed to catch
- But judge defaulted to PASS (API unavailable) so bad plan was not caught

### Run 6 Fired
- Key: TEST-1776098485
- UUID: 4f8bbbed-4c98-4023-abbb-a0d56f379d69
- Fly machine: e148e066dfe989 (morning-sound-1367)
- Started: 2026-04-13T16:42:27Z
