FROM oven/bun:latest AS builder
WORKDIR /app

COPY . .

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
RUN bun run build

FROM oven/bun:latest AS runner
WORKDIR /app

ENV NODE_ENV=production
EXPOSE 3000

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/next.config.ts ./next.config.ts

RUN bun install --frozen-lockfile
