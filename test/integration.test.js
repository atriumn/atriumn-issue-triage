import { describe, it, before, beforeEach, after } from 'node:test';
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

function makeCommentPayload(repo = 'idynic', number = 1, commentBody = '/ralph') {
  return JSON.stringify({
    action: 'created',
    comment: {
      id: 123,
      body: commentBody,
      user: { login: 'jeff' },
    },
    issue: {
      number,
      title: 'Test issue',
      body: 'Test issue body',
    },
    repository: {
      name: repo,
      full_name: `atriumn/${repo}`,
    },
  });
}

describe('Webhook Server', () => {
  let app;

  before(() => {
    process.env.GITHUB_WEBHOOK_SECRET = TEST_SECRET;
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
      assert.ok('ralphSpawned' in body);
      assert.ok('startedAt' in body);
    });
  });

  describe('POST /webhook — signature verification', () => {
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
  });

  describe('POST /webhook — issues event', () => {
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
      assert.match(JSON.parse(res.payload).message, /Ignoring action/);
    });

    it('accepts opened issue and responds with Notified', async () => {
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
      assert.equal(JSON.parse(res.payload).message, 'Notified');
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
      assert.equal(JSON.parse(res.payload).message, 'Repo not enabled');
    });

    it('deduplicates same issue', async () => {
      const payload = makeIssuePayload('veriumn', 99);
      const sig = signPayload(payload);

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
      assert.equal(JSON.parse(res1.payload).message, 'Notified');

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

  describe('POST /webhook — issue_comment event', () => {
    it('ignores non-created comment actions', async () => {
      const payload = JSON.stringify({
        action: 'edited',
        comment: { body: '/ralph' },
        issue: { number: 1, title: 'Test', body: 'body' },
        repository: { name: 'idynic' },
      });
      const sig = signPayload(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issue_comment',
          'x-hub-signature-256': sig,
        },
        payload,
      });
      assert.equal(res.statusCode, 200);
      assert.match(JSON.parse(res.payload).message, /Ignoring comment action/);
    });

    it('ignores comments that do not start with /ralph', async () => {
      const payload = makeCommentPayload('idynic', 1, 'Just a regular comment');
      const sig = signPayload(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issue_comment',
          'x-hub-signature-256': sig,
        },
        payload,
      });
      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.payload).message, 'Not a /ralph command');
    });

    it('spawns Ralph on /ralph comment', async () => {
      const payload = makeCommentPayload('idynic', 50, '/ralph');
      const sig = signPayload(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issue_comment',
          'x-hub-signature-256': sig,
        },
        payload,
      });
      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.payload).message, 'Spawning Ralph');
    });

    it('spawns Ralph on /ralph with extra text', async () => {
      const payload = makeCommentPayload('idynic', 51, '/ralph please fix this');
      const sig = signPayload(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issue_comment',
          'x-hub-signature-256': sig,
        },
        payload,
      });
      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.payload).message, 'Spawning Ralph');
    });

    it('skips disabled repos for /ralph', async () => {
      const payload = makeCommentPayload('unknown-repo', 1, '/ralph');
      const sig = signPayload(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issue_comment',
          'x-hub-signature-256': sig,
        },
        payload,
      });
      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.payload).message, 'Repo not enabled');
    });

    it('deduplicates /ralph spawns', async () => {
      const payload = makeCommentPayload('ovrly', 77, '/ralph');
      const sig = signPayload(payload);

      const res1 = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issue_comment',
          'x-hub-signature-256': sig,
        },
        payload,
      });
      assert.equal(JSON.parse(res1.payload).message, 'Spawning Ralph');

      const res2 = await app.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'issue_comment',
          'x-hub-signature-256': sig,
        },
        payload,
      });
      assert.equal(JSON.parse(res2.payload).message, 'Already spawned');
    });
  });

  describe('POST /webhook — unknown events', () => {
    it('ignores unknown events', async () => {
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
      assert.match(JSON.parse(res.payload).message, /Ignoring event/);
    });
  });
});
