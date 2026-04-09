FROM node:20-slim AS builder

RUN corepack enable pnpm

WORKDIR /build

COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json ./

RUN pnpm install --frozen-lockfile

COPY src/ ./src/
COPY prisma/ ./prisma/

# Generate Prisma client before tsc — @prisma/client types must be present for compilation
RUN pnpm exec prisma generate --schema ./prisma/schema.prisma

RUN pnpm build

RUN pnpm install --frozen-lockfile --prod


FROM node:20-slim

ARG TARGETARCH

RUN corepack enable pnpm

WORKDIR /app

# fuse-overlayfs + uidmap: rootless Docker support on Fly.io (no privileged containers)
RUN apt-get update && apt-get install -y \
    git \
    curl \
    bash \
    jq \
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
RUN npm install -g opencode-ai@1.3.3

COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./

COPY src/workers/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
COPY src/workers/config/opencode.json /app/opencode.json

LABEL org.opencontainers.image.source="https://github.com/ai-employee/ai-employee"
LABEL org.opencontainers.image.description="AI Employee worker container - runs OpenCode agent sessions"

CMD ["bash", "entrypoint.sh"]
