# register-webhook

**Description**: Register a webhook endpoint with Hostfully for a specific event type

**Invocation**: `tsx /tools/hostfully/register-webhook.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--url` | required | Public URL to receive webhook events |
| `--event-type` | required | Hostfully event type (e.g. NEW_INBOX_MESSAGE) |
