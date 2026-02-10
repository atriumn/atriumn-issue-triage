# Architecture

## Overview

atriumn-issue-triage is a Fastify webhook server that processes GitHub issue events for the atriumn organization. It uses Claude Opus for deep issue analysis and takes automated actions based on confidence levels.

## Data Flow

```
GitHub (org webhook)
    │
    ▼
POST /webhook
    │
    ├── Verify HMAC-SHA256 signature (security.js)
    ├── Check event type (only issues.opened)
    ├── Validate repo is enabled (config.js)
    ├── Deduplication check (24h TTL)
    │
    ├── Respond 200 to GitHub immediately
    │
    ▼ (async)
Pipeline (pipeline.js)
    │
    ├── 1. Opus Analysis (analyzer.js)
    │   └── Claude Opus evaluates: type, severity, fixability, confidence
    │
    ├── 2. Determine Action (analyzer.js:determineAction)
    │   ├── clarify    → needsClarification has questions
    │   ├── auto-spawn → autoFixable + confidence ≥ 85%
    │   ├── offer-fix  → autoFixable + confidence 70-85%
    │   └── notify     → everything else
    │
    ├── 3. Execute Action
    │   ├── clarify    → Post GitHub comment (clarifier.js)
    │   ├── auto-spawn → Spawn Ralph (spawner.js)
    │   └── offer-fix / notify → (notification only)
    │
    └── 4. Always: Telegram notification (notifier.js)
```

## Components

### Webhook Server (src/index.js)

The entry point. Handles HTTP routing, request validation, and orchestration.

- **Rate limiting**: 10 requests/minute per IP via @fastify/rate-limit
- **Deduplication**: In-memory Map with 24h TTL per `repo#number` key, pruned hourly
- **Async processing**: Webhook responds immediately with 200; analysis runs in background
- **Metrics**: In-memory counters exposed at `GET /metrics`
- **Raw body capture**: Custom content parser preserves raw body for HMAC verification

### Opus Analyzer (src/analyzer.js)

Interfaces with the Anthropic API to analyze issues.

- **Prompt construction**: Includes issue details, repo context, auto-fix guidelines
- **Response parsing**: Expects JSON with schema validation (type, severity, confidence, etc.)
- **Decision engine**: `determineAction()` applies thresholds and safety checks
- **Safety checks**: `noAutoFixPatterns` prevent auto-fix on security/migration/credential issues

Analysis output schema:
```json
{
  "type": "bug|feature|enhancement|question|docs|chore",
  "severity": "critical|high|medium|low",
  "autoFixable": true,
  "confidence": 0.92,
  "reasoning": "...",
  "acceptanceCriteria": ["..."],
  "needsClarification": [],
  "ralphPrompt": "Detailed prompt for Ralph..."
}
```

### Pipeline (src/pipeline.js)

Orchestrates the triage flow. Accepts dependency injection for testability — all external dependencies (analyzer, notifier, spawner, clarifier) can be overridden via `deps` parameter.

### Notifier (src/notifier.js)

Formats human-readable Telegram messages with emoji, severity, confidence, and analysis reasoning. Sends via `ralph-notify.sh` shell script.

### Spawner (src/spawner.js)

Spawns Ralph to auto-fix issues. Writes the Opus-generated prompt (or a fallback) to a temp file, then invokes `ralph-spawn.sh` with project/issue/prompt-file args. Cleans up temp file after spawning.

### Clarifier (src/clarifier.js)

Posts clarifying questions as GitHub issue comments via the GitHub REST API. Formats numbered questions with a branded footer.

### Security (src/security.js)

HMAC-SHA256 webhook signature verification using timing-safe comparison. Validates the `x-hub-signature-256` header against the raw request body.

### Config (src/config.js)

Per-repository configuration and environment variable access. Uses lazy getters for env vars so tests can set `process.env` after import.

## Security Model

1. **Webhook authentication**: Every request must have a valid HMAC-SHA256 signature
2. **Rate limiting**: Prevents abuse (10 req/min per IP)
3. **Deduplication**: Prevents replay/re-processing of the same issue
4. **Input validation**: Malformed payloads rejected with 400
5. **No-auto-fix patterns**: Security-sensitive issues never auto-fixed
6. **Secrets**: `.env` file with chmod 600, never logged
7. **systemd hardening**: NoNewPrivileges, ProtectSystem=strict, ProtectHome=read-only, PrivateTmp

## State Management

All state is in-memory (no database):
- **Dedup map**: `Map<string, number>` — tracks processed issues with timestamps
- **Metrics counters**: Simple numeric counters reset on restart

This is intentional for v1.0 — the service handles low volume (~20 issues/month) and state loss on restart is acceptable (worst case: an issue gets re-analyzed).
