# atriumn-issue-triage

Opus-powered GitHub issue triage system for the atriumn organization.

Receives GitHub issue webhooks, analyzes them with Claude Opus, and takes action: notifies via Telegram, auto-spawns Ralph for high-confidence fixes, or posts clarifying questions as GitHub comments.

## Quick Start

```bash
# Install dependencies
npm ci

# Copy and configure environment
cp .env.example .env
# Edit .env with your secrets

# Run in development (auto-restart on changes)
npm run dev

# Run in production
npm start

# Run tests
npm test
```

## How It Works

1. **Webhook received** — GitHub sends an `issues.opened` event to `POST /webhook`
2. **Signature verified** — HMAC-SHA256 validation against shared secret
3. **Opus analyzes** — Claude Opus reads the issue, assesses type/severity/fixability
4. **Action taken** based on confidence:
   - **>=85% confidence + auto-fixable** — Ralph is spawned immediately
   - **70-85% confidence + auto-fixable** — Jeff is notified with offer to spawn Ralph
   - **Clarification needed** — Questions posted as GitHub comment
   - **Otherwise** — Triage summary sent to Jeff via Telegram

## Architecture

```
GitHub Webhook → Fastify Server → Signature Check → Opus Analysis → Decision Engine
                                                                        │
                                    ┌───────────────────────────────────┤
                                    │              │                    │
                              Auto-Spawn      Clarify            Notify Jeff
                              (Ralph)    (GitHub Comment)       (Telegram)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Monitored Repositories

| Repo | Auto-Spawn | Priority |
|------|-----------|----------|
| idynic | Yes | high |
| veriumn | Yes | high |
| ovrly | Yes | medium |
| tariff | Yes | medium |
| atriumn-site | No | low |

## Configuration

Environment variables (see `.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_WEBHOOK_SECRET` | Yes | HMAC secret for webhook verification |
| `GITHUB_TOKEN` | Yes | GitHub PAT with `issues:write` scope |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Opus |
| `PORT` | No | Server port (default: 3847) |
| `STATE_DIR` | No | State directory (default: `/var/lib/issue-triage`) |
| `RALPH_SPAWN_SCRIPT` | No | Path to ralph-spawn.sh |
| `RALPH_NOTIFY_SCRIPT` | No | Path to ralph-notify.sh |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhook` | GitHub webhook receiver |
| `GET` | `/health` | Health check (`{"status":"ok"}`) |
| `GET` | `/metrics` | Processing statistics |

## Deployment

```bash
# One-time setup on target machine
bash scripts/setup.sh

# Start the service
sudo systemctl start issue-triage

# View logs
journalctl -u issue-triage -f
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full deployment guide.

## Tuning

Confidence thresholds and auto-fix behavior are configurable in `src/config.js`. See [docs/TUNING.md](docs/TUNING.md) for guidance on adjusting false positive rates.
