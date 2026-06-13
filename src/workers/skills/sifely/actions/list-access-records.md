# list-access-records

**Description**: List recent access records (unlock/lock events) for a Sifely lock

**Invocation**: `tsx /tools/sifely/list-access-records.ts [flags]`

**Environment variables**: SIFELY_CLIENT_ID, SIFELY_USERNAME, SIFELY_PASSWORD

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--lock-id` | required | Sifely lock ID |
| `--start-date` | optional | Start timestamp in ms (default: 2 hours ago) |
| `--end-date` | optional | End timestamp in ms (default: now) |
