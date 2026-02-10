import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { formatMessage } from '../src/notifier.js';

/** Helper: build a valid analysis result */
function makeAnalysis(overrides = {}) {
  return {
    type: 'bug',
    severity: 'high',
    autoFixable: true,
    confidence: 0.92,
    reasoning: 'Clear TypeError at ProfileEdit.tsx:42. Missing null check.',
    acceptanceCriteria: ['Profile page loads without error for new users'],
    needsClarification: [],
    ralphPrompt: 'Fix the TypeError in ProfileEdit.tsx...',
    ...overrides,
  };
}

describe('formatMessage', () => {
  it('formats auto-spawn notification', () => {
    const msg = formatMessage('idynic', 42, makeAnalysis(), 'auto-spawn', 'TypeError in profile');
    assert.ok(msg.includes('\u{1F527} Auto-fixing idynic#42'));
    assert.ok(msg.includes('Title: TypeError in profile'));
    assert.ok(msg.includes('BUG | Severity: HIGH'));
    assert.ok(msg.includes('Confidence: 92%'));
    assert.ok(msg.includes('Clear TypeError'));
    assert.ok(msg.includes('https://github.com/atriumn/idynic/issues/42'));
  });

  it('formats offer-fix notification', () => {
    const msg = formatMessage('idynic', 42, makeAnalysis({ confidence: 0.78 }), 'offer-fix', 'Bug');
    assert.ok(msg.includes('\u{1F916} Auto-fix available: idynic#42'));
    assert.ok(msg.includes('Confidence: 78%'));
  });

  it('formats clarify notification with questions', () => {
    const analysis = makeAnalysis({
      needsClarification: ['Which browser?', 'Can you reproduce?'],
    });
    const msg = formatMessage('ovrly', 10, analysis, 'clarify', 'Weird layout');
    assert.ok(msg.includes('\u{2753} Issue needs clarification: ovrly#10'));
    assert.ok(msg.includes('Questions:'));
    assert.ok(msg.includes('- Which browser?'));
    assert.ok(msg.includes('- Can you reproduce?'));
  });

  it('formats notify (default) with type emoji', () => {
    const analysis = makeAnalysis({ autoFixable: false, type: 'feature' });
    const msg = formatMessage('tariff', 5, analysis, 'notify', 'Add export feature');
    assert.ok(msg.includes('\u{2728} New Issue: tariff#5'));
    assert.ok(msg.includes('FEATURE | Severity: HIGH'));
  });

  it('includes acceptance criteria for non-clarify actions', () => {
    const analysis = makeAnalysis({
      acceptanceCriteria: ['Criterion A', 'Criterion B'],
    });
    const msg = formatMessage('idynic', 1, analysis, 'notify', 'Test');
    assert.ok(msg.includes('Acceptance Criteria:'));
    assert.ok(msg.includes('- Criterion A'));
    assert.ok(msg.includes('- Criterion B'));
  });

  it('omits acceptance criteria for clarify action', () => {
    const analysis = makeAnalysis({
      acceptanceCriteria: ['Should not appear'],
      needsClarification: ['What exactly?'],
    });
    const msg = formatMessage('idynic', 1, analysis, 'clarify', 'Test');
    assert.ok(!msg.includes('Acceptance Criteria:'));
  });

  it('rounds confidence correctly', () => {
    const analysis = makeAnalysis({ confidence: 0.856 });
    const msg = formatMessage('idynic', 1, analysis, 'notify', 'Test');
    assert.ok(msg.includes('Confidence: 86%'));
  });

  it('handles enhancement type', () => {
    const analysis = makeAnalysis({ type: 'enhancement' });
    const msg = formatMessage('idynic', 1, analysis, 'notify', 'Improve perf');
    assert.ok(msg.includes('\u{1F4A1} New Issue: idynic#1'));
    assert.ok(msg.includes('ENHANCEMENT'));
  });

  it('handles docs type', () => {
    const analysis = makeAnalysis({ type: 'docs' });
    const msg = formatMessage('idynic', 1, analysis, 'notify', 'Update docs');
    assert.ok(msg.includes('\u{1F4DD} New Issue: idynic#1'));
  });

  it('handles chore type', () => {
    const analysis = makeAnalysis({ type: 'chore' });
    const msg = formatMessage('idynic', 1, analysis, 'notify', 'Cleanup');
    assert.ok(msg.includes('\u{1F9F9} New Issue: idynic#1'));
  });

  it('handles question type', () => {
    const analysis = makeAnalysis({ type: 'question' });
    const msg = formatMessage('idynic', 1, analysis, 'notify', 'How to configure?');
    assert.ok(msg.includes('\u{2753} New Issue: idynic#1'));
  });

  it('handles empty acceptance criteria', () => {
    const analysis = makeAnalysis({ acceptanceCriteria: [] });
    const msg = formatMessage('idynic', 1, analysis, 'notify', 'Test');
    assert.ok(!msg.includes('Acceptance Criteria:'));
  });

  it('includes issue URL', () => {
    const msg = formatMessage('veriumn', 99, makeAnalysis(), 'notify', 'Test');
    assert.ok(msg.includes('https://github.com/atriumn/veriumn/issues/99'));
  });
});
