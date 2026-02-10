#!/usr/bin/env bash
set -euo pipefail

# Setup script for atriumn-issue-triage
# Run once on the target machine to initialize the service

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== atriumn-issue-triage setup ==="
echo "Project dir: ${PROJECT_DIR}"

# 1. Install dependencies
echo ""
echo "Installing dependencies..."
cd "$PROJECT_DIR"
npm ci --production

# 2. Create state directory
STATE_DIR="${STATE_DIR:-/var/lib/issue-triage}"
echo ""
echo "Creating state directory: ${STATE_DIR}"
sudo mkdir -p "$STATE_DIR"
sudo chown jeff:jeff "$STATE_DIR"
chmod 700 "$STATE_DIR"

# 3. Setup .env file
if [ ! -f "${PROJECT_DIR}/.env" ]; then
  echo ""
  echo "Creating .env from template..."
  cp "${PROJECT_DIR}/.env.example" "${PROJECT_DIR}/.env"
  chmod 600 "${PROJECT_DIR}/.env"
  echo "IMPORTANT: Edit ${PROJECT_DIR}/.env and fill in secrets"
  echo "  - GITHUB_WEBHOOK_SECRET: openssl rand -hex 32"
  echo "  - GITHUB_TOKEN: GitHub PAT with issues:write scope"
  echo "  - ANTHROPIC_API_KEY: Anthropic API key"
else
  echo ""
  echo ".env already exists, skipping"
fi

# 4. Install systemd service
echo ""
echo "Installing systemd service..."
sudo cp "${PROJECT_DIR}/deployment/systemd/issue-triage.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable issue-triage

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit .env with your secrets"
echo "  2. Start the service:  sudo systemctl start issue-triage"
echo "  3. Check status:       sudo systemctl status issue-triage"
echo "  4. View logs:          journalctl -u issue-triage -f"
echo "  5. Setup Tailscale:    bash deployment/tailscale/funnel-setup.sh"
