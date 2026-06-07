# Issues — slack-per-dev-app-architecture

## [2026-06-06] Plan initialized

### Known Blockers

1. **Sandbox Socket Mode support** — unverified; SPIKE must confirm `xapp-` tokens work in Developer Sandbox
2. **`slack run` token injection form** — unverified; SPIKE must determine if it sets `process.env.SLACK_APP_TOKEN` or only writes `.slack/apps.dev.json`
3. **Process ownership** — unverified; SPIKE must confirm `dev.ts` clean shutdown still works with `slack run` in the mix
4. **Sandbox teamId registration** — confirmed blocker; `fetchInstallation` will throw `"No installation for team: <teamId>"` without a matching `slack_integrations` row

### Guardrails (DO NOT VIOLATE)

- Do NOT modify `socket-mode-lock.ts`, single-instance guard (dev.ts:243-254), or Step-0 reaper (dev.ts:280) — EXCEPT extend reaper ONLY if SPIKE proves `slack run` changes process parentage
- Do NOT use Render `PUT /env-vars` for Inngest keys
- Do NOT migrate prod Slack app to CLI manifest
- Do NOT alter `tenant_secrets` schema or redesign `TenantInstallationStore`
- Do NOT commit `.slack/apps*.json` or any `xapp-`/`xoxb-`/`xoxp-` token
- Do NOT accept single @mention as proof — must do 20-trial uuid-tagged proof

## [2026-06-07] Live @mention debugging — Demo App (A0B8X8QL1HA)

### Config verified CORRECT:
- Bot identity: demo_app on Dozal Inc. (T0601SMSVEU), bot_id B0B8Q93HN05
- tenant_integrations: T0601SMSVEU → DozalDevs (00000000-0000-0000-0000-000000000002) ✅
- startup-motivational-messenger archetype active, notification_channel=C0AUBMXKVNU
- victor-tests channel = C0AUBMXKVNU = EXACT notification_channel match ✅
- Bot IS a member of victor-tests (is_member: true) ✅
- Socket Mode probe on new app: num_connections=2 (gateway + probe) → gateway connected to NEW app ✅
- Gateway started 21:42:56, mention at 21:44 → gateway was running

### ROOT CAUSE CANDIDATES (config is fine, so it's the manually-created app):
1. **Missing OAuth scopes**: bot has app_mentions:read,chat:write,chat:write.customize,groups:write,
   channels:history,groups:history,groups:read,im:history,mpim:history,reactions:read,users:read
   MISSING vs manifest: channels:read, im:read, im:write, mpim:read
2. **Event Subscriptions likely NOT configured** — manually-created app; app_mention bot event
   subscription must be explicitly added. This is the #1 suspect.
3. Gateway logs to TERMINAL only (pnpm dev does NOT tee to file). /tmp/ai-dev.log is STALE (05:48).
   To debug live: run `pnpm dev 2>&1 | tee /tmp/ai-dev.log` then grep "app_mention event received".

### Gateway process note:
- 2 gateway leaf processes = normal (tsx supervisor + node leaf = ONE logical gateway). NOT a zombie.

## [2026-06-07] ROOT CAUSE FOUND — wrong bot token registered

### The "Papi Chulo responded instead of Demo App" mystery — SOLVED
- Forensic proof from /tmp/ai-dev.log (teed): LOCAL gateway did EVERYTHING at 03:38:02-05
  - app_mention received (channel C0AUBMXKVNU, team T0601SMSVEU, tenant DozalDevs) ✅
  - intent classified = task, roleName=startup-motivational-messenger ✅
  - Trigger confirmation card posted (archetype b0d5db2e) ✅
- PROD logs in 03:36-03:45 window: 0 (prod did NOT fire at all)
- So the card was posted by the LOCAL gateway using the DozalDevs tenant_secrets.slack_bot_token

### The token mismatch (THE BUG):
- auth.test on the bot token the USER provided ("xoxb-6001905913504-...WnuGFLSFQWCpPl6zxjPei8mp"):
  → bot name: demo_app, bot_id: B0B8Q93HN05  (when tested earlier directly)
- BUT auth.test on the token STORED in DozalDevs tenant_secrets (decrypted):
  → token xoxb-6001905913504-109290...MEpK
  → bot name: PAPICHULO, bot_id: B0ATE1PL3JR, team: Dozal Inc.
- The stored token shares the same WORKSPACE prefix (6001905913504 = Dozal Inc. team) but is a
  DIFFERENT app's bot token (papichulo, not demo_app).
- CONCLUSION: The xoxb- token registered via `pnpm register-dev-slack` belongs to Papi Chulo,
  NOT to Demo App. So the local gateway posts cards AS Papi Chulo. The @mention triggers Demo App's
  socket (app token is Demo App's), but the BOT TOKEN used to POST is Papi Chulo's → Papi Chulo posts.

### Why Confirm does nothing:
- NO block_actions / TRIGGER_CONFIRM event EVER reached the gateway (grep whole teed log = 0 hits)
- The card was posted by Papi Chulo (bot token), but interactivity for button clicks routes to the
  APP that owns the message's interactivity config. Mixed identity (Demo App socket + Papi Chulo
  post) means the Confirm click has no clean handler path on the local Demo App socket.
- Root fix: register the CORRECT Demo App xoxb- token (B0B8Q93HN05) into DozalDevs tenant_secrets.

### num_connections this session: clean (Socket Mode connected, no phantom warning logged)

## [2026-06-07] RESOLVED — correct Demo App token now stored
- Re-ran `pnpm register-dev-slack --team-id T0601SMSVEU --bot-token xoxb-6001905913504-11299699479986-...i8mp`
- Decrypt verification: stored token now ends ...i8mp → auth.test = demo_app / B0B8Q93HN05 ✅
- Previously stored ended ...MEpK → was papichulo / B0ATE1PL3JR (stale seed/prior value)
- The bot token is loaded fresh per-event via loadTenantEnv() in slack-trigger-handler (step 'load-tenant-env'),
  so NO gateway restart strictly required for the BOT TOKEN — next @mention will load the new token from DB.
- HOWEVER: the app token (xapp-) is read once at boot (server.ts:108). That's already Demo App, unchanged.
- Confirm button: now that the SAME app (Demo App) both posts the card AND owns the socket, block_actions
  will route to the local Demo App socket → Confirm should work on next attempt.

## [2026-06-07] Render env-var API — pagination + single-PUT gotchas (prod incident, resolved)
- GOAL: add OPENCODE_GO_API_KEY to prod Render without wiping other vars.
- TRAP 1 (verification false alarm): GET /v1/services/:id/env-vars DEFAULTS to ~20-item page.
  Prod has 21 vars → reads showed "20, SLACK_BOT_TOKEN missing" = PAGINATION, not data loss.
  FIX: always query with ?limit=100 when counting/verifying env vars.
- TRAP 2 (real, but recoverable): single-key PUT /env-vars/:key responses + paginated reads made it
  LOOK like each PUT evicted a different key. Caused whack-a-mole restores. Root cause was the
  pagination artifact above, compounded by reading mid-write.
- CORRECT APPROACH: build COMPLETE array from a ?limit=100 read + known-good overrides, do ONE
  bulk PUT /env-vars, then verify with ?limit=100. 
- KNOWN-GOOD PROD SLACK VALUES (recovered from .sisyphus/evidence/task-6-final-suite.txt this session):
  * SLACK_APP_TOKEN  = xapp-1-A09678HT90S-... (prod Papi Chulo app — NOT the local Demo App A0B8X8QL1HA)
  * SLACK_BOT_TOKEN  = xoxb-6661458697890-9224761438049-... (VLRE Papi Chulo)
  * SLACK_SIGNING_SECRET = f5932eb27cbbffdc244d86da81d6b903 (Papi Chulo)
- CRITICAL REMINDER: local .env SLACK_* are now DEMO APP values (swapped earlier this session).
  NEVER copy local .env SLACK_* to prod. Prod must keep Papi Chulo / A09678HT90S values.
- FINAL STATE: 21 keys, all values exact-verified. OPENCODE_GO_API_KEY added (sk-AEmXD...).

## [2026-06-07] Prod Papi Chulo silent on @mention — missing CLIENT_ID/CLIENT_SECRET
- SYMPTOM: @mention to Papi Chulo (prod) in VLRE got no response; only local REMI app answered.
- DIAGNOSIS: probe of Papi Chulo app token (A09678HT90S) → num_connections=1 (ONLY the probe).
  Prod gateway was NOT holding a Socket Mode connection.
- ROOT CAUSE: server.ts line 110 gates Socket Mode init on
  `if (signingSecret && clientId && clientSecret)`. Prod was MISSING SLACK_CLIENT_ID and
  SLACK_CLIENT_SECRET → fell to else branch → logged "Slack not configured" → no socket.
  (Likely dropped during the earlier env-var pagination churn; my "expected 21" baseline never
  included CLIENT_ID/SECRET so they weren't restored.)
- CORRECT PAPI CHULO VALUES (recovered from .sisyphus/evidence/task-6-final-suite.txt):
  * SLACK_CLIENT_ID     = 6661458697890.9211289927026   (format: workspaceID.appID — has a DOT)
  * SLACK_CLIENT_SECRET = 4ceface4997b43977d33003c4de62d7f
  * SLACK_SIGNING_SECRET= f5932eb27cbbffdc244d86da81d6b903
  NOTE: user mislabeled these when re-sending — Client ID is the dotted one; the plain-hex values
  are Client Secret and Signing Secret respectively. Always disambiguate: Client ID has a dot.
- FIX: PUT both keys to Render (now 23 keys) → redeploy → "Socket Mode connected" x2,
  0 "Slack not configured", probe num_connections=2. Prod Papi Chulo now listening.
- LESSON: the FULL prod Slack set is SIX keys: SLACK_APP_TOKEN, SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_REDIRECT_BASE_URL.
  Socket Mode needs SIGNING_SECRET + CLIENT_ID + CLIENT_SECRET all present.
