# Learnings — gm02-system-prompt

## [2026-04-23] Session ses_243ae015effeRxT48AR4ij5Se2

### Codebase Conventions

- Seed file uses template literals for prompts and string concatenation for instructions
- Archetype upserts use `(prisma.archetype as any).upsert` pattern
- Both `create` and `update` blocks must be updated simultaneously
- Instructions pattern: long string concatenation with `+` operator (see DOZALDEVS_SUMMARIZER_INSTRUCTIONS for pattern)
- Output contract: harness reads `/tmp/summary.txt` AND/OR `/tmp/approval-message.json` at lines 228-232

### Source Material

- Standalone MVP system prompt: `/Users/victordozal/repos/real-estate/vlre-employee/skills/pipeline/processor.ts:63-264`
- 12 sections in the prompt (identity, data/instruction separation [NET-NEW], tone, formatting, structural patterns, allowed, signature, JSON output, polite reply, acknowledgments, confidence, door access)
- Category taxonomy: wifi | access | early-checkin | late-checkout | parking | amenities | maintenance | noise | pets | refund | acknowledgment | other
- Urgency triggers: locked out, gas/CO smell, flooding, fire, broken windows/doors/locks, mold/pests, police, medical emergency

### Key Decisions

- BOT_NAME → generic "professional guest communication specialist" (no persona name hardcoded)
- NO_ACTION_NEEDED → still write /tmp/summary.txt to satisfy harness contract
- Door access → reference get-property.ts output instead of runtime-injected lock data
- DELIVERY_MODE → include send-message.ts instructions (full delivery flow in GM-06)
- Slack channel: C0960S2Q8RL (same as VLRE summarizer)

## [Task 1 completion]
- System prompt length: ~165 lines (12 sections ported from processor.ts:63-264)
- Instructions length: ~35 lines (7 steps as string concatenation)
- Key decision: BOT_NAME replaced with generic "professional guest communication specialist working for a short-term rental property management company"
- Key decision: Door access section adapted — replaced runtime lock diagnosis / Sifely references with "use the property information retrieved from the get-property tool"
- Key decision: Added language detection rule (multilingual support) at end of identity section
- Key decision: Added DATA vs. INSTRUCTIONS BOUNDARY security section (NET-NEW, not in MVP)
- Key decision: NO_ACTION_NEEDED path in instructions writes classification JSON to /tmp/summary.txt (satisfies harness output contract) and does NOT post to Slack
- Seed file grew from 364 lines to 593 lines
- All 5 grep verifications pass: NEEDS_APPROVAL (7), NO_ACTION_NEEDED (11), get-messages.ts, /tmp/summary.txt, DELIVERY_MODE
- Evidence saved to .sisyphus/evidence/task-1-verifications.txt
