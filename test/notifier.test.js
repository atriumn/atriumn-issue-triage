import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatNewIssueMessage, formatRalphSpawnedMessage } from '../src/notifier.js';

function makeIssue(overrides = {}) {
  return {
    title: 'Add smooth transition animation',
    body: 'The signup/signin form transition is jarring. Add a smooth CSS transition.',
    ...overrides,
  };
}

describe('formatNewIssueMessage', () => {
  it('includes repo and issue number in header', () => {
    const msg = formatNewIssueMessage('idynic', 784, makeIssue());
    assert.ok(msg.includes('\u{1F4CB} New Issue: idynic#784'));
  });

  it('includes issue title', () => {
    const msg = formatNewIssueMessage('idynic', 784, makeIssue());
    assert.ok(msg.includes('Add smooth transition animation'));
  });

  it('includes body preview', () => {
    const msg = formatNewIssueMessage('idynic', 784, makeIssue());
    assert.ok(msg.includes('The signup/signin form transition is jarring'));
  });

  it('truncates long body to 200 chars', () => {
    const longBody = 'x'.repeat(300);
    const msg = formatNewIssueMessage('idynic', 1, makeIssue({ body: longBody }));
    assert.ok(msg.includes('x'.repeat(200) + '...'));
    assert.ok(!msg.includes('x'.repeat(201)));
  });

  it('handles empty body', () => {
    const msg = formatNewIssueMessage('idynic', 1, makeIssue({ body: '' }));
    assert.ok(!msg.includes('...'));
    // Should still have the header and URL
    assert.ok(msg.includes('\u{1F4CB} New Issue: idynic#1'));
    assert.ok(msg.includes('https://github.com/atriumn/idynic/issues/1'));
  });

  it('handles null body', () => {
    const msg = formatNewIssueMessage('idynic', 1, makeIssue({ body: null }));
    assert.ok(msg.includes('\u{1F4CB} New Issue: idynic#1'));
  });

  it('includes issue URL', () => {
    const msg = formatNewIssueMessage('veriumn', 99, makeIssue());
    assert.ok(msg.includes('https://github.com/atriumn/veriumn/issues/99'));
  });

  it('includes /ralph instruction', () => {
    const msg = formatNewIssueMessage('idynic', 1, makeIssue());
    assert.ok(msg.includes('Reply /ralph on the issue to auto-fix.'));
  });
});

describe('formatRalphSpawnedMessage', () => {
  it('includes repo and issue number', () => {
    const msg = formatRalphSpawnedMessage('idynic', 784, 'Add transition animation');
    assert.ok(msg.includes('\u{1F680} Ralph spawned: idynic#784'));
  });

  it('includes issue title', () => {
    const msg = formatRalphSpawnedMessage('idynic', 784, 'Add transition animation');
    assert.ok(msg.includes('Add transition animation'));
  });

  it('includes session name', () => {
    const msg = formatRalphSpawnedMessage('idynic', 784, 'Add transition animation');
    assert.ok(msg.includes('Session: idynic-784'));
  });

  it('works with different repos', () => {
    const msg = formatRalphSpawnedMessage('ovrly', 10, 'Fix layout bug');
    assert.ok(msg.includes('\u{1F680} Ralph spawned: ovrly#10'));
    assert.ok(msg.includes('Session: ovrly-10'));
  });
});
