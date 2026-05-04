# Issues

## [2026-05-04T17:32] Session Start

### Known Issues

- OpenCode server exits with code 0 ~11 seconds after printing "listening"
- Root cause: race condition in opencode-server.ts exit handler
- Image Build 7 was built at 17:13 UTC — contains keepalive code but NOT the listeningDetected fix
