#!/usr/bin/env bash
set -euo pipefail

# Health check script for atriumn-issue-triage
# Returns exit code 0 if healthy, 1 if unhealthy

PORT="${PORT:-3847}"
URL="http://localhost:${PORT}/health"

response=$(curl -sf --max-time 5 "$URL" 2>/dev/null) || {
  echo "UNHEALTHY: Server not responding on port ${PORT}"
  exit 1
}

status=$(echo "$response" | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(data.status);
")

if [ "$status" = "ok" ]; then
  echo "HEALTHY: ${response}"
  exit 0
else
  echo "UNHEALTHY: ${response}"
  exit 1
fi
