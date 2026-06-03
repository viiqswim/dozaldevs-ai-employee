# Decisions — Google OAuth Integration

## [2026-06-03] Architecture Decisions

- Per-tenant auth model (one PM connects Google per tenant)
- Full scope access (gmail.modify RESTRICTED + drive RESTRICTED + all Sensitive scopes)
- Shell tools use raw fetch() — googleapis package only in gateway
- Use sub (not email) as external_id in tenant_integrations
- Token refresh persists back to DB (unlike GitHub which generates fresh from App key)
- Multi-process refresh race: accepted as known limitation (same as GitHub)
- GCP Testing mode → must publish to Production mode (7-day token death otherwise)
- approval_required: true on Google Assistant archetype
- Employee archetype: VLRE tenant, slug google-assistant
