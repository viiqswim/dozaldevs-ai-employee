# post-guest-approval

**Description**: Post a guest-reply approval card to Slack for PM review

**Invocation**: `tsx /tools/slack/post-guest-approval.ts [flags]`

**Environment variables**: SLACK_BOT_TOKEN

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--channel` | required | Slack channel ID |
| `--task-id` | required | Task ID for the approval action |
| `--draft-reply` | required | Draft reply text to show in the card |
