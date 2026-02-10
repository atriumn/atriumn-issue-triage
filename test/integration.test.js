import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { buildServer } from '../src/index.js';

const TEST_SECRET = 'test-webhook-secret-1234';

function signPayload(payload) {
  const sig = createHmac('sha256', TEST_SECRET).update(payload).digest('hex');
  return `sha256=${sig}`;
}

function makeIssuePayload(repo = 'idynic', number = 1, action = 'opened') {
  return JSON.stringify({
    action,
    issue: {
      number,
      title: 'Test issue',
      body: 'Test issue body',
      user: { login: 'testuser' },
      labels: [],
    },
    repository: {
      name: repo,
      full_name: `atriumn/${repo}`,
    },
  });
}

describe('Webhook Server', () => {
  let app;

  before(async () => {
    process.env.GITHUB_WEBHOOK_SECRET = TEST_SECRET;
    // Re-import config to pick up env change (config reads env at import time)
    // buildServer uses the already-imported env, so set before importing
  });

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  after(async () => {
    if (app) await app.close();
  });

  describe('GET /health', () => {
    it('returns ok status', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.status, 'ok');
      assert.ok(typeof body.uptime === 'number');
    });
  });

  describe('GET /metrics', () => {
    it('returns metrics', async () => {
      const res = await app.inject({ method: 'GET', url: '/metrics' });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.ok('issuesReceived' in body);
      assert.ok('issuesProcessed' in body);
      assert.ok('startedAt' in body);
    });
  });

  describe('POST /webhook', () => {
    it('rejects missing signature', async () => {
      const payload = makeIssuePayload();
      const res = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
        },
        payload,
      });
      assert.equal(res.statusCode, 401);
    });

    it('rejects invalid signature', async () => {
      const payload = makeIssuePayload();
      const res = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-hub-signature-256': 'sha256=invalid',
        },
        payload,
      });
      assert.equal(res.statusCode, 401);
    });

    it('responds to ping event', async () => {
      const payload = JSON.stringify({ zen: 'test', hook_id: 1 });
      const sig = signPayload(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'ping',
          'x-hub-signature-256': sig,
        },
        payload,
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.message, 'pong');
    });

    it('ignores non-issue events', async () => {
      const payload = JSON.stringify({ action: 'created' });
      const sig = signPayload(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'push',
          'x-hub-signature-256': sig,
        },
        payload,
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.match(body.message, /Ignoring event/);
    });

    it('ignores non-opened actions', async () => {
      const payload = makeIssuePayload('idynic', 1, 'closed');
      const sig = signPayload(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-hub-signature-256': sig,
        },
        payload,
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.match(body.message, /Ignoring action/);
    });

    it('accepts valid webhook and processes', async () => {
      const payload = makeIssuePayload('idynic', 42);
      const sig = signPayload(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-hub-signature-256': sig,
          'x-github-delivery': 'test-delivery-1',
        },
        payload,
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.message, 'Processing');
    });

    it('skips disabled repos', async () => {
      const payload = makeIssuePayload('unknown-repo', 1);
      const sig = signPayload(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-hub-signature-256': sig,
        },
        payload,
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.message, 'Repo not enabled');
    });

    it('deduplicates same issue', async () => {
      const payload = makeIssuePayload('veriumn', 99);
      const sig = signPayload(payload);

      // First request — processes
      const res1 = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-hub-signature-256': sig,
        },
        payload,
      });
      assert.equal(JSON.parse(res1.payload).message, 'Processing');

      // Second request — deduplicated
      const res2 = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issues',
          'x-hub-signature-256': sig,
        },
        payload,
      });
      assert.equal(JSON.parse(res2.payload).message, 'Already processed');
    });
  });
});
