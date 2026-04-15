FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Copy .env.example as .env if no .env is present (build-time defaults)
RUN if [ ! -f .env ]; then cp .env.example .env 2>/dev/null || true; fi

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
RUN chown -R nextjs:nodejs /app/public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# sql.js WASM binary needed at runtime (serverExternalPackages)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sql.js/dist/sql-wasm.wasm ./node_modules/sql.js/dist/sql-wasm.wasm

# Writable runtime caches (segment prerender cache + image optimization cache)
RUN mkdir -p .next/cache/images .next/server/app && chown -R nextjs:nodejs .next

USER nextjs

EXPOSE 4403

ENV PORT=4403
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
