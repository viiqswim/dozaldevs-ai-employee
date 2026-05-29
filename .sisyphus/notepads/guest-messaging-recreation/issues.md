# Issues — guest-messaging-recreation

## [2026-05-29] Known issues at start

### Old archetype

- ID: 00000000-0000-0000-0000-000000000015
- identity = NULL, execution_steps = NULL, delivery_steps = NULL (uses dropped columns)
- Will be soft-deleted in Task 8

### Generator gaps (to fix in Tasks 3-5)

- LLM has NO knowledge of available tools — guesses paths
- Only 3 tool examples in prompt (read-channel, post-message, submit-output)
- No lifecycle env var documentation
- No Hostfully delivery template
- No approval card pattern documented
