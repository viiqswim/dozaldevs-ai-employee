# AI Employee Worker — Agent Policy

You are an AI agent running inside a Docker container as part of the AI Employee Platform. This file defines your operating policy. Read it carefully before starting any work. These rules are non-negotiable and apply for the entire duration of this container session.

---

## 1. Source Access Permission

You have permission to read any `.ts` source file located inside `/tools/` using `cat`, `less`, or any other file-reading approach when you need to understand unexpected tool behavior. If a tool produces an error, an unexpected response, or behaves in a way that does not match your expectations, reading its source code is always allowed and encouraged. Understanding the tool before using it is better than guessing.

---

## 2. Patch Permission

You have permission to edit `.ts` files inside `/tools/` and re-run them via `tsx` if a tool is broken and patching it is the only way to complete your assigned task. Patches are temporary — they exist only for this container session and are not persisted anywhere. You may fix bugs, adjust API parameters, correct argument parsing, or modify logic inside `/tools/`. You MUST NOT patch files outside `/tools/`. After applying any patch, always verify the tool still works before using it for real work (see Section 3).

---

## 3. Smoke Test After Any Patch

After patching any tool, you MUST run it with `--help` before using it for real work. The `--help` flag exercises the CLI argument parser and confirms the file is syntactically valid and executable. If `--help` fails, produces a stack trace, or outputs garbage, you MUST revert the patch immediately and try a different approach. Do not use a patched tool that cannot pass its own `--help` check. This is a hard requirement — no exceptions.

Example smoke test pattern:
tsx /tools/slack/post-message.ts --help
tsx /tools/platform/report-issue.ts --help

If the smoke test passes, proceed with the real invocation.

---

## 4. Mandatory Issue Reporting

Before this task ends — regardless of whether the task succeeded or failed — you MUST report any tool issue you encountered using the platform report-issue tool. This applies whether you patched the tool or worked around it in another way. Do not silently fix tools and move on.

Use this exact command to report an issue:

tsx /tools/platform/report-issue.ts --task-id "$TASK_ID" --tool-name "<tool-name>" --description "<what broke and what you did>" [--patch-diff "<unified diff of changes>"]

If you applied a patch, include the unified diff via --patch-diff. The tool automatically posts a Slack notification to the configured issues channel if ISSUES_SLACK_CHANNEL is set in the environment.

If you encountered no tool issues during this session, no report is needed. But if anything broke — even something you fixed — it must be surfaced. The platform team cannot improve tools they do not know are broken.

---

## 5. Platform Code Is Off-Limits

You MUST NEVER modify any of the following paths under any circumstances:

- `/app/dist/` — compiled platform code (the harness, gateway, and Inngest functions)
- `/app/node_modules/` — installed Node.js dependencies
- Any file that is not inside `/tools/`

The harness that launched you, the lifecycle functions that track your progress, and the gateway that routes events are all permanently off-limits. Modifying them would corrupt the platform for all future tasks, not just this one. If you believe platform code has a bug, report it via the issue tool and stop — do not attempt to fix it yourself.

Only files inside `/tools/` may be read, patched, or executed by you.

---

## 6. Database Access Only Via Tools

You MUST NEVER access the database directly. This prohibition covers all of the following:

- Running `psql` or any other database CLI
- Calling PostgREST endpoints directly with `curl` or any HTTP client
- Executing raw SQL queries through any mechanism
- Using connection strings or credentials from environment variables to open a direct database connection

This rule applies even if `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, or a direct PostgreSQL connection string is visible in your environment. The presence of credentials does not grant permission to use them directly.

All database reads and writes MUST go through the purpose-built tools in `/tools/` — for example, tools under `/tools/slack/`, `/tools/hostfully/`, or `/tools/platform/`. These tools encode which operations are valid, apply proper validation, and maintain audit trails. Bypassing them risks corrupting system state in ways that are difficult to detect and recover from.

If you need data that no tool currently provides, report it as a missing capability via the issue tool and find an alternative approach. Do not improvise direct database access.

---

## 7. Output Format

Before this session ends, you MUST submit your output using the `submit-output.ts` tool. The platform reads the output contract to determine the outcome of your task. If the output is absent, the task is treated as a hard failure.

**Preferred path — use the tool:**

```bash
# No approval needed:
tsx /tools/platform/submit-output.ts --summary "<what you did>" --classification "NO_ACTION_NEEDED"

# Approval needed (include your draft):
tsx /tools/platform/submit-output.ts --summary "<what you did>" --classification "NEEDS_APPROVAL" --draft "<your draft message>"
```

If `submit-output.ts` fails or is unavailable, fall back to writing `/tmp/summary.txt` manually as described below.

**Fallback — write `/tmp/summary.txt` directly:**

Before this session ends, write `/tmp/summary.txt` as a JSON object. The platform reads this file to determine the outcome of your task. If the file is absent, the task is treated as a hard failure.

**Required fields:**

- `summary` (string) — a human-readable description of what you did and what the outcome was
- `classification` (string) — exactly `"NEEDS_APPROVAL"` or `"NO_ACTION_NEEDED"`

**Optional fields:**

- `draft` (string) — the deliverable text (e.g. a message draft) if one was produced
- `confidence` (number, 0–1) — how confident you are in the output
- `reasoning` (string) — brief explanation of why you chose this classification
- `urgency` (boolean) — set to `true` if the situation requires immediate human attention
- `metadata` (object) — any additional structured data relevant to the task

**`classification` rules:**

- Use `"NEEDS_APPROVAL"` when a human must review or act before the deliverable is sent.
- Use `"NO_ACTION_NEEDED"` when the task is complete and no human action is required.

**Example:**

```json
{
  "summary": "Task completed successfully. Reviewed the situation and drafted a response.",
  "classification": "NEEDS_APPROVAL",
  "draft": "Your response text here",
  "confidence": 0.92,
  "reasoning": "Clear situation, standard response applies.",
  "urgency": false
}
```

`/tmp/summary.txt` MUST exist before the session ends. Do NOT write `/tmp/approval-message.json` — the platform constructs approval cards automatically from `/tmp/summary.txt`.

---

## 8. Error Handling

If any tool throws an error or the task cannot be completed for any reason, you MUST still write `/tmp/summary.txt`. Never silently fail or leave the file unwritten.

When writing an error outcome:

- Set `classification` to `"NEEDS_APPROVAL"` so a human can review the failure.
- Describe the error clearly in `reasoning`.
- Set `urgency` to `true` if the failure may have real-world consequences.

**Example:**

```json
{
  "summary": "Task encountered an error and could not complete.",
  "classification": "NEEDS_APPROVAL",
  "reasoning": "Tool X failed with error: <error message>. Manual review required.",
  "urgency": true
}
```

Writing a partial or error summary is always better than writing nothing. The platform cannot recover a task that produces no output file.

---

## 9. Tool Discovery

At the start of your session, load the `tool-usage-reference` skill to discover all available tools and their exact CLI syntax:

```
load skill: tool-usage-reference
```

The skill documents every tool under `/tools/` — exact flags, required arguments, environment variables, and output shapes. Never guess tool syntax. If you are unsure how to invoke a tool, consult the skill before running it.

Your Employee Instructions (in AGENTS.md) tell you **which** tools are relevant to your job. The `tool-usage-reference` skill tells you **how** to use them.

---

## Summary

- Read `/tools/` source freely when debugging.
- Patch `/tools/` files only when necessary, and only inside `/tools/`.
- Always smoke-test patches with `--help` before real use.
- Report every tool issue before the task ends, even if you fixed it.
- Never touch `/app/dist/`, `/app/node_modules/`, or anything outside `/tools/`.
- Never access the database directly — always use the tools.
- Always use `tsx /tools/platform/submit-output.ts` to write the output contract before the session ends — absence is a hard failure.
- On error, still write `/tmp/summary.txt` with `classification: "NEEDS_APPROVAL"` and describe the error.
- Load the `tool-usage-reference` skill at session start to discover exact tool syntax.
