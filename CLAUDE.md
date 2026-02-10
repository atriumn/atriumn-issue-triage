# atriumn-issue-triage

Opus-powered GitHub issue triage system. Receives webhooks, analyzes with Claude Opus, notifies via Telegram, and auto-spawns Ralph for fixable issues.

## Project Structure

- `src/index.js` — Fastify webhook server (port 3847), signature verification, deduplication, rate limiting
- `src/analyzer.js` — Claude Opus integration: builds analysis prompts, parses JSON responses, determines triage action
- `src/pipeline.js` — Orchestrates: analyze → act (clarify/spawn/notify) → always notify Telegram
- `src/notifier.js` — Telegram notifications via ralph-notify.sh
- `src/spawner.js` — Ralph auto-spawn via ralph-spawn.sh with prompt file
- `src/clarifier.js` — Posts clarifying questions as GitHub issue comments
- `src/security.js` — HMAC-SHA256 webhook signature verification
- `src/config.js` — Per-repo config, confidence thresholds, env vars (lazy getters)

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
- Pipeline uses dependency injection (`deps` param) for mocking in tests
- Config env vars use lazy getters so tests can set process.env after import
- Async issue processing: webhook responds immediately, pipeline runs in background

## Decision Logic (src/analyzer.js:determineAction)

1. `needsClarification.length > 0` → `clarify`
2. `!autoFixable` → `notify`
3. Matches `noAutoFixPatterns` (security, credentials, migrations) → `notify`
4. `!repoConf.autoSpawnEnabled` → `notify`
5. `confidence >= 0.85` → `auto-spawn`
6. `confidence >= 0.70` → `offer-fix`
7. Otherwise → `notify`

## Adding a New Repo

Edit `repoConfig` in `src/config.js`. Each repo needs: `enabled`, `autoSpawnEnabled`, `priority`, `projectDir`, `noAutoFixPatterns`.

## Logs

```bash
journalctl -u issue-triage -f    # Follow service logs
```

JSON-structured logging to stdout/stderr. Fields: `ts`, `level`, `msg`, plus context.
