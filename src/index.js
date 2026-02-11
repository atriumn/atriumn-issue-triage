import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { env, getRepoConfig } from './config.js';
import { verifyWebhookSignature } from './security.js';
import { processIssue as runPipeline } from './pipeline.js';
import { deploy } from './deployer.js';

const log = (level, msg, data) => {
  const entry = { ts: new Date().toISOString(), level, msg, ...data };
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
};

/** In-memory metrics */
const metrics = {
  startedAt: new Date().toISOString(),
  issuesReceived: 0,
  issuesProcessed: 0,
  issuesSkipped: 0,
  autoSpawned: 0,
  clarificationsPosted: 0,
  errors: 0,
};

/** Deduplication set: "repo#number" → timestamp */
const processed = new Map();
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function isAlreadyProcessed(repo, number) {
  const key = `${repo}#${number}`;
  const ts = processed.get(key);
  if (ts && Date.now() - ts < DEDUP_TTL_MS) return true;
  return false;
}

function markProcessed(repo, number) {
  const key = `${repo}#${number}`;
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

  // Capture raw body for signature verification
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    req.rawBody = body;
    try {
      done(null, JSON.parse(body.toString()));
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

  // Deploy endpoint (for push events to main branch)
  app.post('/deploy', async (request, reply) => {
    const signature = request.headers['x-hub-signature-256'];
    const event = request.headers['x-github-event'];

    // Verify signature
    try {
      if (!verifyWebhookSignature(request.rawBody, signature)) {
        log('error', 'Deploy webhook signature verification failed');
        return reply.code(401).send({ error: 'Invalid signature' });
      }
    } catch (err) {
      log('error', 'Deploy signature verification error', { error: err.message });
      return reply.code(500).send({ error: 'Signature verification failed' });
    }

    // Only handle push events
    if (event !== 'push') {
      log('info', 'Ignoring non-push deploy event', { event });
      return { ok: true, message: `Ignoring event: ${event}` };
    }

    const { ref } = request.body;
    
    // Only deploy on pushes to main
    if (ref !== 'refs/heads/main') {
      log('info', 'Ignoring push to non-main branch', { ref });
      return { ok: true, message: `Ignoring branch: ${ref}` };
    }

    log('info', 'Deploying from main branch');
    
    // Deploy asynchronously
    deploy().then(result => {
      if (result.success) {
        log('info', 'Deployment successful', { output: result.output });
      } else {
        log('error', 'Deployment failed', { output: result.output });
      }
    }).catch(err => {
      log('error', 'Deployment error', { error: err.message });
    });

    return { ok: true, message: 'Deploying' };
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

    // Handle GitHub ping event (sent when webhook is first configured)
    if (event === 'ping') {
      log('info', 'Received ping event', { deliveryId });
      return { ok: true, message: 'pong' };
    }

    // Only process issue events
    if (event !== 'issues') {
      log('info', 'Ignoring non-issue event', { event, deliveryId });
      return { ok: true, message: `Ignoring event: ${event}` };
    }

    const { action, issue, repository } = request.body;

    // Only process opened issues (and optionally labeled/edited later)
    if (action !== 'opened') {
      log('info', 'Ignoring non-opened action', { action, deliveryId });
      return { ok: true, message: `Ignoring action: ${action}` };
    }

    metrics.issuesReceived++;
    const repoName = repository?.name;
    const issueNumber = issue?.number;

    if (!repoName || !issueNumber) {
      log('error', 'Missing repo name or issue number', { deliveryId });
      return reply.code(400).send({ error: 'Malformed payload' });
    }

    log('info', 'Issue received', { repo: repoName, issue: issueNumber, title: issue.title });

    // Check repo config
    const repoConf = getRepoConfig(repoName);
    if (!repoConf.enabled) {
      log('info', 'Repo not enabled, skipping', { repo: repoName });
      metrics.issuesSkipped++;
      return { ok: true, message: 'Repo not enabled' };
    }

    // Dedup check
    if (isAlreadyProcessed(repoName, issueNumber)) {
      log('info', 'Issue already processed, skipping', { repo: repoName, issue: issueNumber });
      metrics.issuesSkipped++;
      return { ok: true, message: 'Already processed' };
    }

    // Mark as processed immediately to prevent concurrent processing
    markProcessed(repoName, issueNumber);

    // Process asynchronously — respond to GitHub quickly
    processIssue(repoName, issueNumber, issue, repoConf).catch(err => {
      log('error', 'Issue processing failed', {
        repo: repoName,
        issue: issueNumber,
        error: err.message,
      });
      metrics.errors++;
    });

    return { ok: true, message: 'Processing' };
  });

  return app;
}

/**
 * Process an issue through the triage pipeline.
 * This runs asynchronously after the webhook response.
 * @param {string} repo
 * @param {number} number
 * @param {object} issue
 * @param {import('./config.js').RepoConfig} repoConf
 */
async function processIssue(repo, number, issue, repoConf) {
  log('info', 'Processing issue', { repo, number });

  const { analysis, action } = await runPipeline(repo, number, issue, repoConf);

  log('info', 'Triage complete', { repo, number, action, confidence: analysis.confidence });

  if (action === 'clarify') metrics.clarificationsPosted++;
  if (action === 'auto-spawn') metrics.autoSpawned++;
  metrics.issuesProcessed++;
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
