#!/usr/bin/env sh
set -e
bun run prisma:migrate:deploy
exec "$@"
