# Plan: docs-reorganization

## TODOs

- [x] **T1. Create subdirectories** — mkdir docs/architecture docs/phases docs/guides docs/infrastructure docs/external
- [x] **T2. Move architecture files** — git mv 4 files into docs/architecture/
- [x] **T3. Move phases files** — git mv 9 files into docs/phases/
- [x] **T4. Move guides files** — git mv 9 files into docs/guides/
- [x] **T5. Move infrastructure files** — git mv 3 files into docs/infrastructure/
- [x] **T6. Move testing root files** — git mv 3 files into docs/testing/
- [x] **T7. Move external files** — git mv 2 files into docs/external/
- [x] **T8. Update AGENTS.md** — Replace all 13 old docs/ paths + update Docs Directory Structure table
- [x] **T9. Update README.md** — Replace all 5 old docs/ paths
- [x] **T10. Fix inter-doc relative links** — Fix broken relative links in moved files
- [x] **T11. Atomic git commit** — Stage and commit all changes
- [x] **T12. Notify completion** — Send Telegram notification

## Final Verification Wave

- [x] **F1. Path integrity check** — Verify zero .md files remain at docs/ root; all AGENTS.md/README.md paths resolve
- [x] **F2. Broken-link scan** — rg scan for old-style docs/YYYY-MM-DD paths in AGENTS.md and README.md
- [x] **F3. Subdirectory counts** — ls each subdir, verify file counts match plan
- [x] **F4. Content integrity** — git diff confirms only path strings changed, no prose edited
