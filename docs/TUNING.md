# Tuning Guide

## Confidence Thresholds

Thresholds are defined in `src/config.js`:

```javascript
export const thresholds = {
  autoSpawn: 0.85,   // Auto-spawn Ralph immediately
  offerFix: 0.70,    // Notify Jeff with option to spawn
};
```

### Adjusting Thresholds

**If too many false positives (Ralph spawned for issues it can't fix):**
- Raise `autoSpawn` threshold (e.g., 0.90 or 0.95)
- Consider disabling `autoSpawnEnabled` for specific repos

**If too conservative (good fixes being offered instead of auto-spawned):**
- Lower `autoSpawn` threshold (e.g., 0.80)
- Lower `offerFix` threshold if good fixes are being classified as notify-only

**Recommended approach:**
1. Start with defaults (0.85/0.70)
2. Monitor Telegram notifications for a few weeks
3. Track which auto-spawned fixes succeed vs. fail
4. Adjust based on observed patterns

## No-Auto-Fix Patterns

Each repo has `noAutoFixPatterns` in `src/config.js` that prevent auto-fixing for sensitive issues. Default patterns block:

- `/security/i` — Security-related issues
- `/credentials/i` — Credential handling
- `/database.*migration/i` — Database migrations
- `/breaking.*change/i` — Breaking changes

### Adding Patterns

```javascript
// In src/config.js, add to a repo's noAutoFixPatterns:
noAutoFixPatterns: [
  /security/i,
  /credentials/i,
  /database.*migration/i,
  /breaking.*change/i,
  /payment/i,         // Add: payment-related issues
  /infra/i,           // Add: infrastructure changes
],
```

Patterns match against the combined issue title and body.

## Per-Repo Configuration

Each repo can be independently tuned:

- `enabled: false` — Stop processing issues for a repo entirely
- `autoSpawnEnabled: false` — Receive notifications but never auto-spawn Ralph
- `priority` — Informational only (used in notifications)

## Opus Analysis Prompt

The analysis prompt is in `src/analyzer.js:buildAnalysisPrompt()`. Key sections to tune:

**Auto-Fix Guidelines** — Controls when Opus marks issues as auto-fixable. Make stricter by adding more exclusion criteria, or looser by relaxing requirements.

**Clarification behavior** — Opus is instructed to "try to infer intent from context first" and only ask for clarification when truly needed. If too many clarification comments are posted, add guidance to be more aggressive at inferring.

## Monitoring

### Metrics Endpoint

`GET /metrics` returns:

```json
{
  "startedAt": "2025-01-15T10:00:00.000Z",
  "issuesReceived": 15,
  "issuesProcessed": 12,
  "issuesSkipped": 3,
  "autoSpawned": 4,
  "clarificationsPosted": 2,
  "errors": 0,
  "dedupSize": 12
}
```

Key ratios to watch:
- **autoSpawned / issuesProcessed** — Auto-spawn rate. If >50%, thresholds may be too loose
- **clarificationsPosted / issuesProcessed** — Clarification rate. If >30%, prompt may need tuning
- **errors / issuesReceived** — Error rate. Should be near 0

### Logs

```bash
# All triage activity
journalctl -u issue-triage -f

# Filter for errors only
journalctl -u issue-triage -p err

# Filter by repo
journalctl -u issue-triage | grep '"repo":"idynic"'
```

Each processed issue logs: issue received, processing start, triage result (action + confidence).
