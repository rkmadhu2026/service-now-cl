#!/usr/bin/env bash
set -euo pipefail

API_URL="${1:-http://localhost:4000/health}"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

echo "Checking API: ${API_URL}"
curl --silent --show-error --fail "${API_URL}" >/dev/null
echo "API healthy"

echo "Checking Postgres TCP: ${PG_HOST}:${PG_PORT}"
nc -z "${PG_HOST}" "${PG_PORT}"
echo "Postgres reachable"

echo "Checking Redis TCP: ${REDIS_HOST}:${REDIS_PORT}"
nc -z "${REDIS_HOST}" "${REDIS_PORT}"
echo "Redis reachable"

echo "All health checks passed."
