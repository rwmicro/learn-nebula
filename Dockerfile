# syntax=docker/dockerfile:1
#
# Runtime image for the self-hosted deploy. The static export (out/) and the RAG
# chunks (data/rag-chunks.json) are built in CI *before* this image — see
# .github/workflows/docker.yml — so this Dockerfile only packages the pre-built
# site plus the Node (Hono) server. It never clones the notes vault or pulls Git
# LFS; that all happens in the Actions runner where git-lfs is available.

########################  deps  ########################
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
# Toolchain so better-sqlite3 can compile if no prebuilt binary matches.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --prod skips next/react/eslint/…; onlyBuiltDependencies (pnpm-workspace.yaml)
# lets better-sqlite3's native build run under pnpm 10. pnpm-workspace.yaml
# must be copied in: without it pnpm sees no `overrides` at all and refuses
# --frozen-lockfile with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH against the
# overrides recorded in pnpm-lock.yaml.
RUN pnpm install --prod --frozen-lockfile

########################  runtime  ########################
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8085 \
    STATIC_DIR=/app/out \
    DB_PATH=/data/comments.db \
    RAG_CHUNKS=/app/data/rag-chunks.json \
    RAG_VECTORS=/data/rag-vectors.json \
    BUILD_INFO=/app/data/build-info.json \
    VAULT_HEALTH=/app/data/vault-health.json \
    PREREQ_SUGGESTIONS=/app/data/prereq-suggestions.json
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY lib ./lib
# lib/markdown → lib/i18n loads these at import time (translate re-renders notes).
COPY messages ./messages
COPY schema ./schema
COPY data/rag-chunks.json ./data/rag-chunks.json
# Build-time reports read by the admin-only /api/admin/* endpoints
# (scripts/build-info.mjs, scripts/vault-health.ts, scripts/prereq-suggestions.ts)
# — kept out of out/ so the static server never exposes them.
COPY data/build-info.json data/vault-health.json data/prereq-suggestions.json ./data/
COPY out ./out

# /data holds the SQLite comments DB and the embedded-vector cache — mount it so
# comments and the (slow first-run) RAG index survive restarts. Owned by the
# unprivileged `node` user (uid 1000, shipped in the base image) so the server
# can write it after we drop root; a fresh named volume inherits this ownership.
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

# Drop privileges: the server only ever reads /app and writes /data.
USER node

EXPOSE 8085

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8085)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tsx runs the TypeScript server directly — no compile step, and Shiki's WASM +
# the native SQLite binding load cleanly under plain Node.
CMD ["node_modules/.bin/tsx", "server/index.ts"]
