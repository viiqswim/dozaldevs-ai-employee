# post-message

**Description**: Post a message to a Slack channel

**Invocation**: `tsx /tools/slack/post-message.ts [flags]`

**Environment variables**: SLACK_BOT_TOKEN

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--channel` | required | Slack channel ID |
| `--text` | required | Message text to post |
| `--thread-ts` | optional | Thread timestamp to reply to |
