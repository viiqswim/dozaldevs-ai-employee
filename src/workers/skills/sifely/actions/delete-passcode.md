# delete-passcode

**Description**: Delete a passcode from a Sifely smart lock by passcode ID

**Invocation**: `tsx /tools/sifely/delete-passcode.ts [flags]`

**Environment variables**: SIFELY_CLIENT_ID, SIFELY_USERNAME, SIFELY_PASSWORD

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--lock-id` | required | Sifely lock ID |
| `--passcode-id` | required | Passcode ID to delete |
