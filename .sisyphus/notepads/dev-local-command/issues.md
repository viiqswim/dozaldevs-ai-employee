# Issues — dev-local-command

## [2026-05-02] Task: setup
No issues recorded yet.

## [2026-05-02] Task: T1-bugfix — Tunnel false positive
- Bug: curl exits 0 for HTTP 530; Cloudflare CDN always responds even for disconnected tunnels
- Fix: Parse HTTP status code in tunnel already-active check; require 2xx to skip spawn
- Lines changed: ~464-471 in scripts/dev-local.ts
- Commit: 510cd8d
