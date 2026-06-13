# create-passcode

**Description**: Create a new permanent passcode on a Sifely smart lock

**Invocation**: `tsx /tools/sifely/create-passcode.ts [flags]`

**Environment variables**: SIFELY_CLIENT_ID, SIFELY_USERNAME, SIFELY_PASSWORD

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--lock-id` | required | Sifely lock ID |
| `--name` | required | Passcode name (e.g. permanent-visitor-home) |
| `--code` | required | Numeric passcode to set |
