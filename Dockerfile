# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# prisma.config.ts reads DATABASE_URL when Prisma loads; generate does not connect to the DB
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN bun run prisma:generate && bun run build

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json bun.lock ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Copy proto files (needed for gRPC)
COPY --from=builder /app/src/proto ./dist/proto

# Prisma: schema + migrations for `migrate deploy` at container start
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/src/database/schema.prisma ./src/database/schema.prisma
COPY --from=builder /app/src/database/migrations ./src/database/migrations

# Copy generated Prisma client next to compiled code (runtime require path)
COPY --from=builder /app/src/database/generated ./dist/database/generated

COPY scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chown -R bun:bun ./prisma.config.ts ./src/database ./docker-entrypoint.sh

# Expose HTTP and gRPC ports
EXPOSE 4010 4011

USER bun

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:4010/healthz || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["bun", "run", "start:prod"]
