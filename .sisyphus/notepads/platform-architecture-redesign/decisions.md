# Decisions — Platform Architecture Redesign

## 2026-04-17 Session Start

### Approved LLMs

- Primary/execution: `minimax/minimax-m2.7`
- Verifier/judge: `anthropic/claude-haiku-4-5`
- No other models. Settled decision. Don't revisit.

### Feedback response mechanism

- Inline Haiku 4.5 call in Inngest function (~2s, cheap)
- No Fly.io machine for acknowledgments

### @mention handling

- Included in this plan
- Intent classification via Haiku
- Four categories: feedback / teaching / question / task

### Corrective action from feedback

- Acknowledge + learn ONLY
- No re-execution from feedback

### Post-approval delivery

- Spawn new Fly.io machine with OpenCode
- Not inline in lifecycle function

### Tool access model

- Shell scripts at `/tools/` in container
- No MCP servers
- No TypeScript tool registry

### Generic harness fate

- DELETED at end of plan (Task 26)
- Replaced by OpenCode harness for all employees

### Engineering lifecycle

- Deprecated, not deleted
- `lifecycle.ts` untouched

### Scope boundaries

- IN: schema, models, lifecycle, OpenCode, feedback, @mentions, cleanup
- OUT: engineering changes, pgvector, autonomous mode, colleague discovery
