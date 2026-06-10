---
name: long-running-commands
description: 'Use when running any command expected to take >30 seconds (docker build, pnpm dev, pnpm trigger-task, fly logs, cloudflared). Covers the tmux launch+poll pattern, the 5 mandatory cleanup rules, session naming, and the macOS vnode-exhaustion risk.'
---

# Long-Running Commands

**NEVER** run commands expected to take >30 seconds with a blocking shell call. Launch in a detached tmux session with output piped to a log file. Poll every 30–60 seconds.

## Commands That ALWAYS Require tmux

- `pnpm trigger-task`
- `pnpm dev`
- `docker build`
- `fly logs`
- `cloudflared tunnel`

## tmux Launch + Poll Pattern

```bash
# Launch
tmux new-session -d -s <name> -x 220 -y 50
tmux send-keys -t <name> \
  "cd /path/to/repo && COMMAND 2>&1 | tee /tmp/<name>.log; echo 'EXIT_CODE:'$? >> /tmp/<name>.log" \
  Enter

# Poll
tail -30 /tmp/<name>.log
grep "EXIT_CODE:" /tmp/<name>.log && echo "DONE" || echo "RUNNING"
```

## Session Naming Convention

| Session name | Use case            | Log file            |
| ------------ | ------------------- | ------------------- |
| `ai-e2e`     | E2E test runs       | `/tmp/ai-e2e.log`   |
| `ai-dev`     | `pnpm dev` stack    | `/tmp/ai-dev.log`   |
| `ai-build`   | Docker image builds | `/tmp/ai-build.log` |

---

## Tmux Session Cleanup (MANDATORY)

Stale tmux sessions accumulate zsh processes, gitstatus watchers, and kernel vnodes. On macOS, this exhausts the vnode table (`kern.maxvnodes`) and triggers `ENFILE: file table overflow` errors — even when file descriptor limits are not reached. **This has caused production-impacting failures.**

### Rule 1 — Kill sessions when done

After a long-running command completes (EXIT_CODE detected in log), immediately kill its tmux session:

```bash
tmux kill-session -t <name>
```

### Rule 2 — Never leave sessions overnight

At the end of any task execution, kill ALL tmux sessions you created:

```bash
tmux list-sessions -F '#{session_name}' | grep '^ai-' | xargs -I{} tmux kill-session -t {}
```

### Rule 3 — Pre-flight check

Before creating a new tmux session, check how many exist. If more than 10 are alive, kill finished ones first:

```bash
echo "Active tmux sessions: $(tmux list-sessions 2>/dev/null | wc -l | tr -d ' ')"
```

### Rule 4 — Reuse session names

Prefer reusing names like `ai-build` over creating `ai-build2`, `ai-build3`, etc. Kill the old one first:

```bash
tmux kill-session -t ai-build 2>/dev/null; tmux new-session -d -s ai-build -x 220 -y 50
```

### Rule 5 — Final wave cleanup

Every plan's Final Verification Wave must include a step that kills all tmux sessions created during execution.

---

## macOS vnode Exhaustion Risk

Stale tmux sessions accumulate kernel vnodes on macOS. When `kern.maxvnodes` is exhausted, the OS triggers `ENFILE: file table overflow` — this is NOT a file descriptor limit issue, it is a vnode table overflow. The symptom is that new file opens fail system-wide even though `ulimit -n` appears fine.

**Prevention**: Follow all 5 cleanup rules above. Never leave tmux sessions running after a task completes.
