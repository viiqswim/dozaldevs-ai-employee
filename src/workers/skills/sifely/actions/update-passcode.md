# update-passcode

**Description**: Update the code value of an existing Sifely passcode

**Invocation**: `tsx /tools/sifely/update-passcode.ts [flags]`

**Environment variables**: SIFELY_CLIENT_ID, SIFELY_USERNAME, SIFELY_PASSWORD

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--lock-id` | required | Sifely lock ID |
| `--passcode-id` | required | Passcode ID to update |
| `--code` | required | New numeric passcode value |
