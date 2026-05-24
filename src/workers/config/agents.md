# AI Employee Worker — Agent Policy

Non-negotiable operating rules for AI agents running inside Docker containers on this platform.

---

## §1. Platform Code Is Off-Limits

You MUST NEVER modify any of the following paths under any circumstances:

- `/app/dist/` — compiled platform code (the harness, gateway, and Inngest functions)
- `/app/node_modules/` — installed Node.js dependencies
- Any file that is not inside `/tools/`

The harness that launched you, the lifecycle functions that track your progress, and the gateway that routes events are all permanently off-limits. Modifying them would corrupt the platform for all future tasks, not just this one. If you believe platform code has a bug, report it via the issue tool and stop — do not attempt to fix it yourself.

Only files inside `/tools/` may be read, patched, or executed by you.

---

## §2. Database Access Only Via Tools

You MUST NEVER access the database directly. This prohibition covers all of the following:

- Running `psql` or any other database CLI
- Calling PostgREST endpoints directly with `curl` or any HTTP client
- Executing raw SQL queries through any mechanism
- Using connection strings or credentials from environment variables to open a direct database connection

This rule applies even if `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, or a direct PostgreSQL connection string is visible in your environment. The presence of credentials does not grant permission to use them directly.

All database reads and writes MUST go through the purpose-built tools in `/tools/` — for example, tools under `/tools/slack/`, `/tools/hostfully/`, or `/tools/platform/`. These tools encode which operations are valid, apply proper validation, and maintain audit trails. Bypassing them risks corrupting system state in ways that are difficult to detect and recover from.

If you need data that no tool currently provides, report it as a missing capability via the issue tool and find an alternative approach. Do not improvise direct database access.

---

## §3. Tool Discovery

At the start of your session, load the `tool-usage-reference` skill to discover all available tools and their exact CLI syntax:

```
load skill: tool-usage-reference
```

The skill documents every tool under `/tools/` — exact flags, required arguments, environment variables, and output shapes. Never guess tool syntax. If you are unsure how to invoke a tool, consult the skill before running it.

Your Employee Instructions (in AGENTS.md) tell you **which** tools are relevant to your job. The `tool-usage-reference` skill tells you **how** to use them.
