#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Setting up automated deployment..."

# 1. Give issue-triage service sudo permission to restart itself (no password)
# This needs to be done FIRST (requires manual sudo password entry)
echo "🔐 Configuring sudo permissions (requires your password)..."
echo "jeff ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart issue-triage" | sudo tee /etc/sudoers.d/issue-triage-deploy
sudo chmod 440 /etc/sudoers.d/issue-triage-deploy

# 2. Add /deploy endpoint to Tailscale funnel
echo "📡 Configuring Tailscale funnel for /deploy endpoint..."
tailscale serve --bg --https=443 --set-path=/deploy http://localhost:3847/deploy

# 3. Ensure service is installed and running
echo "⚙️  Installing systemd service..."
cd /home/jeff/projects/atriumn-issue-triage
sudo cp deployment/systemd/issue-triage.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable issue-triage

# Create state directory
sudo mkdir -p /var/lib/issue-triage
sudo chown jeff:jeff /var/lib/issue-triage

# Start the service
echo "▶️  Starting issue-triage service..."
sudo systemctl restart issue-triage

# Wait and verify
sleep 2
if systemctl is-active --quiet issue-triage; then
  echo "✅ Service is running"
else
  echo "❌ Service failed to start"
  sudo systemctl status issue-triage
  exit 1
fi

# Show funnel status
echo ""
echo "📊 Tailscale funnel status:"
tailscale funnel status

echo ""
echo "✅ Deployment automation setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure GitHub push webhook:"
echo "   URL: https://atriumn-box-1.tail3b84f9.ts.net/deploy"
echo "   Events: Just the push event"
echo "   Secret: (same as issue webhook)"
echo ""
echo "2. Test it: Push to main → service auto-updates"
