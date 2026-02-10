import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { formatClarificationComment, postComment, postClarification } from '../src/clarifier.js';

describe('formatClarificationComment', () => {
  it('includes all questions numbered', () => {
    const questions = ['What browser?', 'Desktop or mobile?'];
    const result = formatClarificationComment(questions);
    assert.ok(result.includes('1. What browser?'));
    assert.ok(result.includes('2. Desktop or mobile?'));
  });

  it('includes the header', () => {
    const result = formatClarificationComment(['Question 1']);
    assert.ok(result.includes('Need More Information'));
  });

  it('includes the footer attribution', () => {
    const result = formatClarificationComment(['Q1']);
    assert.ok(result.includes('atriumn-issue-triage'));
  });

  it('includes auto-fix teaser', () => {
    const result = formatClarificationComment(['Q1']);
    assert.ok(result.includes('Once clarified, I can likely auto-fix this'));
  });

  it('handles single question', () => {
    const result = formatClarificationComment(['Is this on production?']);
    assert.ok(result.includes('1. Is this on production?'));
    assert.ok(!result.includes('2.'));
  });

  it('handles many questions', () => {
    const questions = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
    const result = formatClarificationComment(questions);
    assert.ok(result.includes('5. Q5'));
  });
});

describe('postComment', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    process.env.GITHUB_TOKEN = 'test-token-123';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GITHUB_TOKEN;
  });

  it('throws if GITHUB_TOKEN is not set', async () => {
    delete process.env.GITHUB_TOKEN;
    await assert.rejects(
      () => postComment('idynic', 42, 'test'),
      { message: 'GITHUB_TOKEN not configured' },
    );
  });

  it('sends POST to correct GitHub API URL', async () => {
    let calledUrl;
    let calledOpts;
    globalThis.fetch = mock.fn(async (url, opts) => {
      calledUrl = url;
      calledOpts = opts;
      return { ok: true };
    });

    await postComment('idynic', 42, 'Hello');

    assert.equal(calledUrl, 'https://api.github.com/repos/atriumn/idynic/issues/42/comments');
    assert.equal(calledOpts.method, 'POST');
  });

  it('sends correct headers and body', async () => {
    let calledOpts;
    globalThis.fetch = mock.fn(async (url, opts) => {
      calledOpts = opts;
      return { ok: true };
    });

    await postComment('idynic', 42, 'Test body');

    assert.equal(calledOpts.headers['Authorization'], 'token test-token-123');
    assert.equal(calledOpts.headers['Accept'], 'application/vnd.github+json');
    assert.equal(calledOpts.headers['X-GitHub-Api-Version'], '2022-11-28');

    const parsed = JSON.parse(calledOpts.body);
    assert.equal(parsed.body, 'Test body');
  });

  it('throws on non-ok response', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    }));

    await assert.rejects(
      () => postComment('idynic', 42, 'test'),
      /GitHub API error 404: Not Found/,
    );
  });

  it('handles text() failure gracefully', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => { throw new Error('read failed'); },
    }));

    await assert.rejects(
      () => postComment('idynic', 42, 'test'),
      /GitHub API error 500/,
    );
  });
});

describe('postClarification', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    process.env.GITHUB_TOKEN = 'test-token-123';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GITHUB_TOKEN;
  });

  it('posts formatted clarification comment', async () => {
    let postedBody;
    globalThis.fetch = mock.fn(async (url, opts) => {
      postedBody = JSON.parse(opts.body).body;
      return { ok: true };
    });

    await postClarification('veriumn', 10, ['What browser?', 'Steps to reproduce?']);

    assert.ok(postedBody.includes('Need More Information'));
    assert.ok(postedBody.includes('1. What browser?'));
    assert.ok(postedBody.includes('2. Steps to reproduce?'));
  });

  it('sends to correct repo and issue', async () => {
    let calledUrl;
    globalThis.fetch = mock.fn(async (url) => {
      calledUrl = url;
      return { ok: true };
    });

    await postClarification('ovrly', 99, ['Q1']);

    assert.equal(calledUrl, 'https://api.github.com/repos/atriumn/ovrly/issues/99/comments');
  });
});
