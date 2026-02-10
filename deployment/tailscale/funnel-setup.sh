#!/usr/bin/env bash
set -euo pipefail

# Setup Tailscale Funnel for issue-triage webhook endpoint
# This exposes port 3847 to the public internet via Tailscale

PORT="${PORT:-3847}"

echo "Setting up Tailscale Funnel on port ${PORT}..."

# Check if tailscale is available
if ! command -v tailscale &>/dev/null; then
  echo "Error: tailscale CLI not found"
  exit 1
fi

# Enable HTTPS and funnel
tailscale serve --bg --https=443 "http://localhost:${PORT}"
tailscale funnel 443 on

# Show the public URL
HOSTNAME=$(tailscale status --json | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(data.Self.DNSName.replace(/\.\$/, ''));
")

echo ""
echo "Funnel active!"
echo "Public webhook URL: https://${HOSTNAME}/webhook"
echo ""
echo "Configure this URL in GitHub org webhook settings:"
echo "  Payload URL: https://${HOSTNAME}/webhook"
echo "  Content-Type: application/json"
echo "  Events: Issues → opened"
