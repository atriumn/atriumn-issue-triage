import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { env, getRepoConfig } from './config.js';
import { verifyWebhookSignature } from './security.js';
import { notifyNewIssue, notifyRalphSpawned } from './notifier.js';
import { spawnRalph } from './spawner.js';

const log = (level, msg, data) => {
  const entry = { ts: new Date().toISOString(), level, msg, ...data };
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
};

/** In-memory metrics */
const metrics = {
  startedAt: new Date().toISOString(),
  issuesReceived: 0,
  issuesNotified: 0,
  ralphSpawned: 0,
  issuesSkipped: 0,
  errors: 0,
};

/** Deduplication set: "repo#number" or "ralph:repo#number" → timestamp */
const processed = new Map();
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function isDuplicate(key) {
  const ts = processed.get(key);
  if (ts && Date.now() - ts < DEDUP_TTL_MS) return true;
  return false;
}

function markProcessed(key) {
  processed.set(key, Date.now());
}

/** Prune old dedup entries periodically */
function pruneProcessed() {
  const cutoff = Date.now() - DEDUP_TTL_MS;
  for (const [key, ts] of processed) {
    if (ts < cutoff) processed.delete(key);
  }
}

export function buildServer() {
  const app = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024, // 1MB
  });

  // Remove default parsers so we can capture raw body for signature verification.
  // GitHub may send application/x-www-form-urlencoded with a `payload` field
  // containing JSON, even when the webhook is configured for application/json.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body, done) => {
    req.rawBody = body;
    try {
      const str = body.toString();
      if (str.startsWith('payload=')) {
        done(null, JSON.parse(decodeURIComponent(str.slice(8).replace(/\+/g, '%20'))));
      } else {
        done(null, JSON.parse(str));
      }
    } catch (err) {
      done(err, undefined);
    }
  });

  // Rate limiting: 10 req/min per IP
  app.register(rateLimit, {
    max: 10,
    timeWindow: '1 minute',
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', uptime: process.uptime() };
  });

  // Metrics
  app.get('/metrics', async () => {
    return { ...metrics, dedupSize: processed.size };
  });

  // Webhook endpoint
  app.post('/webhook', async (request, reply) => {
    const signature = request.headers['x-hub-signature-256'];
    const event = request.headers['x-github-event'];
    const deliveryId = request.headers['x-github-delivery'];

    // Verify signature
    try {
      if (!verifyWebhookSignature(request.rawBody, signature)) {
        log('error', 'Webhook signature verification failed', { deliveryId });
        return reply.code(401).send({ error: 'Invalid signature' });
      }
    } catch (err) {
      log('error', 'Signature verification error', { error: err.message });
      return reply.code(500).send({ error: 'Signature verification failed' });
    }

    // Handle GitHub ping event
    if (event === 'ping') {
      log('info', 'Received ping event', { deliveryId });
      return { ok: true, message: 'pong' };
    }

    // Handle new issues
    if (event === 'issues') {
      return handleNewIssue(request, reply, deliveryId);
    }

    // Handle /ralph comments
    if (event === 'issue_comment') {
      return handleIssueComment(request, reply, deliveryId);
    }

    log('info', 'Ignoring event', { event, deliveryId });
    return { ok: true, message: `Ignoring event: ${event}` };
  });

  return app;
}

/**
 * Handle issues.opened — notify via Telegram.
 */
function handleNewIssue(request, reply, deliveryId) {
  const { action, issue, repository } = request.body;

  if (action !== 'opened') {
    log('info', 'Ignoring non-opened action', { action, deliveryId });
    return { ok: true, message: `Ignoring action: ${action}` };
  }

  const repoName = repository?.name;
  const issueNumber = issue?.number;

  if (!repoName || !issueNumber) {
    log('error', 'Missing repo name or issue number', { deliveryId });
    return reply.code(400).send({ error: 'Malformed payload' });
  }

  metrics.issuesReceived++;

  const repoConf = getRepoConfig(repoName);
  if (!repoConf.enabled) {
    log('info', 'Repo not enabled, skipping', { repo: repoName });
    metrics.issuesSkipped++;
    return { ok: true, message: 'Repo not enabled' };
  }

  const dedupKey = `issue:${repoName}#${issueNumber}`;
  if (isDuplicate(dedupKey)) {
    log('info', 'Issue already processed, skipping', { repo: repoName, issue: issueNumber });
    metrics.issuesSkipped++;
    return { ok: true, message: 'Already processed' };
  }

  markProcessed(dedupKey);
  log('info', 'New issue received', { repo: repoName, issue: issueNumber, title: issue.title });

  // Notify asynchronously
  notifyNewIssue(repoName, issueNumber, issue).then(() => {
    metrics.issuesNotified++;
    log('info', 'Notification sent', { repo: repoName, issue: issueNumber });
  }).catch(err => {
    log('error', 'Notification failed', { repo: repoName, issue: issueNumber, error: err.message });
    metrics.errors++;
  });

  return { ok: true, message: 'Notified' };
}

/**
 * Handle issue_comment.created — spawn Ralph if comment starts with /ralph.
 */
function handleIssueComment(request, reply, deliveryId) {
  const { action, comment, issue, repository } = request.body;

  if (action !== 'created') {
    return { ok: true, message: `Ignoring comment action: ${action}` };
  }

  const body = (comment?.body || '').trim();
  if (!body.startsWith('/ralph')) {
    return { ok: true, message: 'Not a /ralph command' };
  }

  const repoName = repository?.name;
  const issueNumber = issue?.number;

  if (!repoName || !issueNumber) {
    log('error', 'Missing repo name or issue number in comment event', { deliveryId });
    return reply.code(400).send({ error: 'Malformed payload' });
  }

  const repoConf = getRepoConfig(repoName);
  if (!repoConf.enabled) {
    log('info', 'Repo not enabled, skipping /ralph', { repo: repoName });
    return { ok: true, message: 'Repo not enabled' };
  }

  const dedupKey = `ralph:${repoName}#${issueNumber}`;
  if (isDuplicate(dedupKey)) {
    log('info', 'Ralph already spawned for this issue', { repo: repoName, issue: issueNumber });
    return { ok: true, message: 'Already spawned' };
  }

  markProcessed(dedupKey);
  log('info', '/ralph command received', { repo: repoName, issue: issueNumber });

  // Spawn and notify asynchronously
  spawnRalph(repoName, issueNumber, issue).then(() => {
    metrics.ralphSpawned++;
    log('info', 'Ralph spawned', { repo: repoName, issue: issueNumber });
    return notifyRalphSpawned(repoName, issueNumber, issue.title);
  }).catch(err => {
    log('error', 'Ralph spawn failed', { repo: repoName, issue: issueNumber, error: err.message });
    metrics.errors++;
  });

  return { ok: true, message: 'Spawning Ralph' };
}

/** Start the server */
async function start() {
  const app = buildServer();

  // Prune dedup map every hour
  setInterval(pruneProcessed, 60 * 60 * 1000);

  try {
    await app.listen({ port: env.port, host: '0.0.0.0' });
    log('info', 'Server started', { port: env.port });
  } catch (err) {
    log('error', 'Failed to start server', { error: err.message });
    process.exit(1);
  }
}

// Only start if this is the main module (not imported for testing)
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
