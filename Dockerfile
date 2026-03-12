# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client (schema is in src/database)
RUN bun run prisma:generate

# Build the application
RUN bun run build

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

# Copy generated Prisma client next to compiled code (runtime require path)
COPY --from=builder /app/src/database/generated ./dist/database/generated

# Uncomment when using gRPC (create src/proto and add .proto files first):
# COPY --from=builder /app/src/proto ./dist/proto

# Expose HTTP and gRPC ports
EXPOSE 4010 4011

USER bun

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4010/healthz || exit 1

CMD ["bun", "dist/main.js"]
