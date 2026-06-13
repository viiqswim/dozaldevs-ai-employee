# rotate-property-code

**Description**: Rotates the lock code for a single Hostfully property and all its associated Sifely locks, updating both Sifely passcodes and the Hostfully door code field.

**Invocation**: `tsx /tools/sifely/rotate-property-code.ts [flags]`

**Environment variables**: SUPABASE_URL, SUPABASE_SECRET_KEY, TENANT_ID, SIFELY_USERNAME, SIFELY_PASSWORD, HOSTFULLY_API_KEY

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--property-id` | required | Hostfully property UID to rotate the code for |
| `--code` | optional | Use this specific code instead of generating a new one |
