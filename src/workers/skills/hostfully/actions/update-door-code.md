# update-door-code

**Description**: Update the door code custom data field for a Hostfully property

**Invocation**: `tsx /tools/hostfully/update-door-code.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--property-id` | required | Hostfully property UID |
| `--code` | required | New door code value to set |
