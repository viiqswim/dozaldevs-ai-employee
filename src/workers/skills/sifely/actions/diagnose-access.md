# diagnose-access

**Description**: Cross-references Hostfully door codes against Sifely smart lock passcodes and recent access records to diagnose guest lock access issues.

**Invocation**: `tsx /tools/sifely/diagnose-access.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY, SIFELY_CLIENT_ID, SIFELY_USERNAME, SIFELY_PASSWORD, SUPABASE_URL, SUPABASE_SECRET_KEY, TENANT_ID

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--property-id` | required | Hostfully property UID to diagnose |
