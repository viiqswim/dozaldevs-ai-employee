# Learnings

## 2026-05-07 Task: Plan Analysis

### Key Research Facts

- Feedback Pipeline: `feedback-handler`, `feedback-responder`, `mention-handler` DO NOT EXIST. PLAT-10 complete.
- Unified event: `employee/interaction.received` (source: `thread_reply` | `mention`) → `interaction-handler`
- Rule extraction: `employee/rule.extract-requested` → `rule-extractor` (extracts behavioral rules, posts Slack confirmation cards)
- 9 Inngest functions registered in serve.ts: universal-lifecycle, interaction-handler, rule-extractor, daily-summarizer, feedback-summarizer, learned-rules-expiry + 3 deprecated engineering ones
- Worker tools: slack/, locks/, hostfully/ (8 scripts), knowledge_base/ (search.ts), platform/ (report-issue.ts)
- Newer snapshot: 2026-04-29-2255 (vs stale reference 2026-04-24-1452)
- src/lib/ has 16 files (AGENTS.md said 12); missing: classify-message, hostfully-precheck, slack-blocks, telegram-client
- New Archetype fields: agents_md, delivery_instructions, notification_channel
- Docker infra: shared-infra.yml + supabase-services.yml (in addition to docker-compose.yml)
- README.md "Local Development (Docker)" section IS valid — commands exist in package.json

### Guardrails

- Do NOT touch docs/snapshots/ files (point-in-time only — update references, not files)
- Do NOT fix inngest-serve.test.ts test file — only fix its description
- Do NOT touch deprecated component table entries
- No exact file/test counts — use descriptions
- No new H2 sections in AGENTS.md — fold into existing
