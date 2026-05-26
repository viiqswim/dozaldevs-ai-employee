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
# Skills: baked into image for native OpenCode skill discovery
COPY src/workers/skills/ /app/.opencode/skills/
COPY src/workers/config/agents.md /app/AGENTS.md

# Copy ALL worker tools into the image — no per-file COPY needed.
# Adding a new tool or service? Just commit to src/worker-tools/ and rebuild.
COPY --from=builder /build/src/worker-tools/ /tools/
RUN cd /tools && npm install --production
ENV NODE_PATH=/tools/node_modules

LABEL org.opencontainers.image.source="https://github.com/ai-employee/ai-employee"
LABEL org.opencontainers.image.description="AI Employee worker container - runs OpenCode agent sessions"

CMD ["bash", "entrypoint.sh"]
