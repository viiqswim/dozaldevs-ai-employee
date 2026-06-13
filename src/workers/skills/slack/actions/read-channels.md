# read-channels

**Description**: Read recent messages from one or more Slack channels

**Invocation**: `tsx /tools/slack/read-channels.ts [flags]`

**Environment variables**: SLACK_BOT_TOKEN

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--channels` | required | Comma-separated list of channel IDs |
| `--limit` | optional | Max messages per channel (default: 10) |
