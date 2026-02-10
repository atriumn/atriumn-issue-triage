# Deployment Guide

## Prerequisites

- Node.js >= 22
- Tailscale installed and authenticated
- GitHub org admin access (for webhook configuration)
- Anthropic API key
- GitHub PAT with `issues:write` scope

## Initial Setup

### 1. Clone and install

```bash
cd /home/jeff/projects
git clone git@github.com:atriumn/atriumn-issue-triage.git
cd atriumn-issue-triage
```

### 2. Run setup script

```bash
bash scripts/setup.sh
```

This will:
- Install npm dependencies
- Create state directory at `/var/lib/issue-triage`
- Copy `.env.example` to `.env` (if not exists)
- Install and enable the systemd service

### 3. Configure secrets

```bash
# Edit .env file
nano .env
```

Fill in:
- `GITHUB_WEBHOOK_SECRET` — generate with `openssl rand -hex 32`
- `GITHUB_TOKEN` — GitHub PAT (Settings → Developer settings → Personal access tokens)
- `ANTHROPIC_API_KEY` — from Anthropic console

### 4. Start the service

```bash
sudo systemctl start issue-triage
sudo systemctl status issue-triage
```

### 5. Setup Tailscale Funnel

```bash
bash deployment/tailscale/funnel-setup.sh
```

This exposes port 3847 publicly via Tailscale Funnel. Note the public URL (e.g., `https://atriumn-box.tail*.ts.net`).

### 6. Configure GitHub Org Webhook

1. Go to GitHub → atriumn org → Settings → Webhooks → Add webhook
2. **Payload URL**: `https://<your-tailscale-url>/webhook`
3. **Content type**: `application/json`
4. **Secret**: Same value as `GITHUB_WEBHOOK_SECRET` in `.env`
5. **Events**: Select "Issues" only
6. **Active**: Check

GitHub will send a ping event — check logs to confirm it was received:
```bash
journalctl -u issue-triage -f
```

## Service Management

```bash
# Start/stop/restart
sudo systemctl start issue-triage
sudo systemctl stop issue-triage
sudo systemctl restart issue-triage

# Status
sudo systemctl status issue-triage

# Logs (follow)
journalctl -u issue-triage -f

# Logs (last 100 lines)
journalctl -u issue-triage -n 100

# Health check
curl http://localhost:3847/health

# Metrics
curl http://localhost:3847/metrics
```

## Updating

```bash
cd /home/jeff/projects/atriumn-issue-triage
git pull
npm ci --production
sudo systemctl restart issue-triage
```

## Troubleshooting

### Service won't start

```bash
# Check logs for startup errors
journalctl -u issue-triage -n 50

# Common issues:
# - Missing .env file or secrets
# - Port 3847 already in use
# - Node.js not found (check /usr/bin/node)
```

### Webhook not received

1. Check GitHub webhook delivery logs (Settings → Webhooks → Recent Deliveries)
2. Verify Tailscale Funnel is running: `tailscale funnel status`
3. Test locally: `curl http://localhost:3847/health`

### Signature verification fails

- Ensure `GITHUB_WEBHOOK_SECRET` in `.env` matches the secret in GitHub webhook settings
- Check for trailing whitespace/newlines in the `.env` value

### Opus analysis fails

- Verify `ANTHROPIC_API_KEY` is valid
- Check API rate limits at the Anthropic console
- Look for error details in journal logs
