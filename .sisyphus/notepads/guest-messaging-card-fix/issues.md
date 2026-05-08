# Issues — guest-messaging-card-fix

## 2026-05-08 Init
- Pre-existing test failures: inngest-serve.test.ts (expects 2 functions, gets 10), container-boot.test.ts (Docker required)
- Docker rebuild REQUIRED after post-message.ts change (baked into image)
