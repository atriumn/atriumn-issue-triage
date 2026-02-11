# atriumn-issue-triage

Thin webhook relay for GitHub issue triage. Receives webhooks, notifies via Telegram, and spawns Ralph on `/ralph` comments.

## Project Structure

- `src/index.js` — Fastify webhook server (port 3847), signature verification, deduplication, rate limiting, handles `issues` and `issue_comment` events
- `src/notifier.js` — Telegram notifications via Bot API (new issues + Ralph spawn)
- `src/spawner.js` — Ralph auto-spawn via ralph-spawn.sh with prompt file
- `src/security.js` — HMAC-SHA256 webhook signature verification
- `src/config.js` — Per-repo config (`enabled`, `projectDir`), env vars (lazy getters)

## Commands

```bash
npm test          # Run all tests (node --test)
npm start         # Start production server
npm run dev       # Start with --watch for development
```

## Key Patterns

- ESM (`type: module`), Node.js >=22
- No TypeScript — uses JSDoc type annotations
- `buildServer()` exported from index.js for test injection (no listen)
- Config env vars use lazy getters so tests can set process.env after import
- Async processing: webhook responds immediately, notify/spawn runs in background

## Flow

1. **New issue opened** → Telegram notification with issue details and `/ralph` hint
2. **`/ralph` comment on issue** → Ralph spawned in tmux with issue context, Telegram notified

## Adding a New Repo

Edit `repoConfig` in `src/config.js`. Each repo needs: `enabled`, `projectDir`.

## Logs

```bash
journalctl -u issue-triage -f    # Follow service logs
```

JSON-structured logging to stdout/stderr. Fields: `ts`, `level`, `msg`, plus context.
