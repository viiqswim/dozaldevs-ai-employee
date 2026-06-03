# Issues & Gotchas

## Known Bugs Being Fixed

- `findByExternalId` uses `findFirst` — non-deterministic when multiple tenants share installation_id
- `installation.deleted` handler only cleans up first tenant — missing iteration over all matching tenants
- `installation.deleted` handler has no try/catch — unhandled rejection risk

## Watch Points

- `TenantSecretRepository.delete()` does hard-delete (Prisma `.delete()`) — acceptable for secrets
- T2 depends on T1 completing first (needs findManyByExternalId to exist)
- T5 dashboard work depends on T3 + T4 completing first
- T6 unit tests depend on T1, T2, T3, T4 all completing first
