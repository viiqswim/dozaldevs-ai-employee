FROM node:22-slim AS builder

RUN corepack enable pnpm

WORKDIR /build

COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY src/ ./src/
COPY prisma/ ./prisma/

# Generate Prisma client before tsc — @prisma/client types must be present for compilation
RUN pnpm exec prisma generate --schema ./prisma/schema.prisma

RUN pnpm build

RUN pnpm install --frozen-lockfile --prod --ignore-scripts


FROM node:22-slim

ARG TARGETARCH

RUN corepack enable pnpm

WORKDIR /app

# fuse-overlayfs + uidmap: rootless Docker support on Fly.io (no privileged containers)
RUN apt-get update && apt-get install -y \
    git \
    curl \
    bash \
    jq \
    sqlite3 \
    ca-certificates \
    fuse-overlayfs \
    uidmap \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://github.com/cli/cli/releases/download/v2.45.0/gh_2.45.0_linux_${TARGETARCH}.tar.gz" \
    -o /tmp/gh.tar.gz \
    && tar -xzf /tmp/gh.tar.gz -C /tmp \
    && mv "/tmp/gh_2.45.0_linux_${TARGETARCH}/bin/gh" /usr/local/bin/gh \
    && rm -rf /tmp/gh*

# opencode-ai is the correct npm package name (not 'opencode' or '@opencode/cli')
# 1.14.31 is the last known-working version — 1.14.33 causes session bootstrap failure (exit code 0 ~6s after session creation)
RUN npm install -g opencode-ai@1.14.31 && \
    ARCH=$(uname -m | sed 's/x86_64/x64/g;s/aarch64/arm64/g') && \
    npm install -g "opencode-linux-${ARCH}@1.14.31"
RUN npm install -g tsx

# Pre-warm OpenCode SQLite database during build so the migration doesn't run at container start.
# opencode serve runs the migration on first launch; running it here bakes the migrated DB into the image.
RUN opencode serve --port 4097 --hostname 127.0.0.1 &>/dev/null & \
    SERVE_PID=$! && \
    for i in $(seq 1 120); do \
      sleep 1; \
      curl -sf http://127.0.0.1:4097/global/health >/dev/null 2>&1 && break; \
    done && \
    kill $SERVE_PID 2>/dev/null; \
    sleep 2; \
    DB_PATH="$(echo ~)/.local/share/opencode/opencode.db"; \
    [ -f "$DB_PATH" ] && sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true

# Disable OpenCode auto-update in the global config so containers don't self-update on startup.
# This must run AFTER the pre-warm step above (which creates ~/.config/opencode/).
RUN mkdir -p ~/.config/opencode && \
    echo '{"autoupdate":false}' > ~/.config/opencode/opencode.json

COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./

COPY src/workers/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
COPY src/workers/config/opencode.json /app/opencode.json
COPY src/workers/config/agents.md /app/AGENTS.md

RUN mkdir -p /tools/slack
COPY --from=builder /build/src/worker-tools/slack/read-channels.ts /tools/slack/read-channels.ts
COPY --from=builder /build/src/worker-tools/slack/post-message.ts /tools/slack/post-message.ts
COPY --from=builder /build/src/worker-tools/slack/post-guest-approval.ts /tools/slack/post-guest-approval.ts
RUN npm install --prefix /tools/slack @slack/web-api@^7.15.1

RUN mkdir -p /tools/hostfully/fixtures/get-messages /tools/hostfully/fixtures/get-reservations /tools/hostfully/fixtures/get-property
COPY --from=builder /build/src/worker-tools/hostfully/validate-env.ts /tools/hostfully/validate-env.ts
COPY --from=builder /build/src/worker-tools/hostfully/get-property.ts /tools/hostfully/get-property.ts
COPY --from=builder /build/src/worker-tools/hostfully/get-properties.ts /tools/hostfully/get-properties.ts
COPY --from=builder /build/src/worker-tools/hostfully/get-reservations.ts /tools/hostfully/get-reservations.ts
COPY --from=builder /build/src/worker-tools/hostfully/get-messages.ts /tools/hostfully/get-messages.ts
COPY --from=builder /build/src/worker-tools/hostfully/get-reviews.ts /tools/hostfully/get-reviews.ts
COPY --from=builder /build/src/worker-tools/hostfully/send-message.ts /tools/hostfully/send-message.ts
COPY --from=builder /build/src/worker-tools/hostfully/fixtures/get-messages/default.json /tools/hostfully/fixtures/get-messages/default.json
COPY --from=builder /build/src/worker-tools/hostfully/fixtures/get-reservations/default.json /tools/hostfully/fixtures/get-reservations/default.json
COPY --from=builder /build/src/worker-tools/hostfully/fixtures/get-property/default.json /tools/hostfully/fixtures/get-property/default.json

RUN mkdir -p /tools/platform
COPY --from=builder /build/src/worker-tools/platform/report-issue.ts /tools/platform/report-issue.ts

RUN mkdir -p /tools/knowledge_base
COPY --from=builder /build/src/worker-tools/knowledge_base/search.ts /tools/knowledge_base/search.ts

RUN mkdir -p /tools/locks
COPY --from=builder /build/src/worker-tools/locks/sifely-client.ts /tools/locks/sifely-client.ts
COPY --from=builder /build/src/worker-tools/locks/hostfully-door-code.ts /tools/locks/hostfully-door-code.ts
COPY --from=builder /build/src/worker-tools/locks/diagnose-access.ts /tools/locks/diagnose-access.ts
COPY --from=builder /build/src/worker-tools/locks/generate-code.ts /tools/locks/generate-code.ts
COPY --from=builder /build/src/worker-tools/locks/update-door-code.ts /tools/locks/update-door-code.ts
COPY --from=builder /build/src/worker-tools/locks/rotate-property-code.ts /tools/locks/rotate-property-code.ts

LABEL org.opencontainers.image.source="https://github.com/ai-employee/ai-employee"
LABEL org.opencontainers.image.description="AI Employee worker container - runs OpenCode agent sessions"

CMD ["bash", "entrypoint.sh"]
