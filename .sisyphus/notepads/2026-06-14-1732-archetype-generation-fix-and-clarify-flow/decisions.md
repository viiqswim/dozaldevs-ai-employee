# Decisions

## [2026-06-14] Plan Decisions

- Fix scope: JSON mode + retry-on-empty + clear errors. NOT automatic model fallback.
- Retry bounded to exactly ONE attempt (max 2 LLM calls total per callLLMWithJsonRetry call)
- converse() failure semantics (no_change/too_long/question) must NOT change
- Single-textbox entry preserved: chat appears ONLY when clarification is needed
- ONE generalized useChatConversation hook shared by AssistantTab AND CreateEmployeePage
- ONE ArchetypeGenerator.converse() method called by both propose-edit AND converse-create routes
- No automatic model fallback (user-excluded)
- No skill-registry-drift guardrail (user-excluded)
