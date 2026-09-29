#!/usr/bin/env bash
# Example: run a full JuryAI trial and print the NDJSON audit event stream.
#
# Usage:
#   ./examples/run_trial.sh                       # hits local standalone service
#   BASE_URL=https://your-host ./examples/run_trial.sh
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default to this environment's external backend URL if available, else localhost.
if [[ -z "${BASE_URL:-}" ]]; then
  if [[ -f /app/frontend/.env ]]; then
    BASE_URL="$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2 | tr -d '"')"
  fi
  BASE_URL="${BASE_URL:-http://localhost:8001}"
fi

echo "==> Health check: ${BASE_URL}/api/v1/health"
curl -s "${BASE_URL}/api/v1/health"
echo

echo "==> Streaming trial (NDJSON): ${BASE_URL}/api/v1/trials/run"
curl -N -s -X POST "${BASE_URL}/api/v1/trials/run" \
  -H "Content-Type: application/json" \
  --data-binary "@${HERE}/sample_case.json"
echo

echo "==> Synchronous CasePacket: ${BASE_URL}/api/v1/trials/run-sync"
curl -s -X POST "${BASE_URL}/api/v1/trials/run-sync" \
  -H "Content-Type: application/json" \
  --data-binary "@${HERE}/sample_case.json"
echo
