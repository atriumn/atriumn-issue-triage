import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysisPrompt, parseAnalysisResult, determineAction } from '../src/analyzer.js';

const mockRepoConf = {
  enabled: true,
  autoSpawnEnabled: true,
  priority: 'high',
  projectDir: '/home/jeff/projects/idynic',
  noAutoFixPatterns: [/security/i, /credentials/i, /database.*migration/i, /breaking.*change/i],
};

const mockIssue = {
  number: 42,
  title: 'TypeError in profile page',
  body: 'Getting a TypeError when loading the profile page for new users.',
  user: { login: 'testuser' },
  labels: [{ name: 'bug' }],
};

/** Helper: build a valid analysis result */
function makeAnalysis(overrides = {}) {
  return {
    type: 'bug',
    severity: 'high',
    autoFixable: true,
    confidence: 0.9,
    reasoning: 'Clear TypeError with identifiable root cause.',
    acceptanceCriteria: ['Profile page loads without error for new users'],
    needsClarification: [],
    ralphPrompt: 'Fix the TypeError in ProfileEdit.tsx...',
    ...overrides,
  };
}

describe('buildAnalysisPrompt', () => {
  it('includes issue details in prompt', () => {
    const prompt = buildAnalysisPrompt(mockIssue, 'idynic', mockRepoConf);
    assert.ok(prompt.includes('idynic'));
    assert.ok(prompt.includes('#42'));
    assert.ok(prompt.includes('TypeError in profile page'));
    assert.ok(prompt.includes('testuser'));
    assert.ok(prompt.includes('bug'));
    assert.ok(prompt.includes('Getting a TypeError'));
  });

  it('includes project directory', () => {
    const prompt = buildAnalysisPrompt(mockIssue, 'idynic', mockRepoConf);
    assert.ok(prompt.includes('/home/jeff/projects/idynic'));
  });

  it('handles empty body', () => {
    const issue = { ...mockIssue, body: '' };
    const prompt = buildAnalysisPrompt(issue, 'idynic', mockRepoConf);
    assert.ok(prompt.includes('(empty)'));
  });

  it('handles missing labels', () => {
    const issue = { ...mockIssue, labels: [] };
    const prompt = buildAnalysisPrompt(issue, 'idynic', mockRepoConf);
    assert.ok(prompt.includes('none'));
  });
});

describe('parseAnalysisResult', () => {
  it('parses valid JSON', () => {
    const result = parseAnalysisResult(JSON.stringify(makeAnalysis()));
    assert.equal(result.type, 'bug');
    assert.equal(result.severity, 'high');
    assert.equal(result.autoFixable, true);
    assert.equal(result.confidence, 0.9);
  });

  it('strips markdown code fences', () => {
    const json = JSON.stringify(makeAnalysis());
    const result = parseAnalysisResult(`\`\`\`json\n${json}\n\`\`\``);
    assert.equal(result.type, 'bug');
  });

  it('strips plain code fences', () => {
    const json = JSON.stringify(makeAnalysis());
    const result = parseAnalysisResult(`\`\`\`\n${json}\n\`\`\``);
    assert.equal(result.type, 'bug');
  });

  it('rejects missing required fields', () => {
    const incomplete = { type: 'bug' };
    assert.throws(() => parseAnalysisResult(JSON.stringify(incomplete)), /Missing required field/);
  });

  it('rejects invalid type', () => {
    const bad = makeAnalysis({ type: 'invalid' });
    assert.throws(() => parseAnalysisResult(JSON.stringify(bad)), /Invalid type/);
  });

  it('rejects invalid severity', () => {
    const bad = makeAnalysis({ severity: 'urgent' });
    assert.throws(() => parseAnalysisResult(JSON.stringify(bad)), /Invalid severity/);
  });

  it('rejects non-boolean autoFixable', () => {
    const bad = makeAnalysis({ autoFixable: 'yes' });
    assert.throws(() => parseAnalysisResult(JSON.stringify(bad)), /autoFixable must be a boolean/);
  });

  it('rejects confidence out of range', () => {
    assert.throws(() => parseAnalysisResult(JSON.stringify(makeAnalysis({ confidence: 1.5 }))), /confidence must be a number/);
    assert.throws(() => parseAnalysisResult(JSON.stringify(makeAnalysis({ confidence: -0.1 }))), /confidence must be a number/);
  });

  it('rejects non-array acceptanceCriteria', () => {
    const bad = makeAnalysis({ acceptanceCriteria: 'not an array' });
    assert.throws(() => parseAnalysisResult(JSON.stringify(bad)), /acceptanceCriteria must be an array/);
  });

  it('rejects non-array needsClarification', () => {
    const bad = makeAnalysis({ needsClarification: 'not an array' });
    assert.throws(() => parseAnalysisResult(JSON.stringify(bad)), /needsClarification must be an array/);
  });

  it('rejects invalid JSON', () => {
    assert.throws(() => parseAnalysisResult('not json'), /JSON/);
  });
});

describe('determineAction', () => {
  it('returns clarify when needsClarification has items', () => {
    const analysis = makeAnalysis({ needsClarification: ['What browser?'] });
    assert.equal(determineAction(analysis, 'idynic', mockIssue, mockRepoConf), 'clarify');
  });

  it('returns notify when not auto-fixable', () => {
    const analysis = makeAnalysis({ autoFixable: false });
    assert.equal(determineAction(analysis, 'idynic', mockIssue, mockRepoConf), 'notify');
  });

  it('returns auto-spawn for high confidence', () => {
    const analysis = makeAnalysis({ confidence: 0.9 });
    assert.equal(determineAction(analysis, 'idynic', mockIssue, mockRepoConf), 'auto-spawn');
  });

  it('returns offer-fix for medium confidence', () => {
    const analysis = makeAnalysis({ confidence: 0.75 });
    assert.equal(determineAction(analysis, 'idynic', mockIssue, mockRepoConf), 'offer-fix');
  });

  it('returns notify for low confidence', () => {
    const analysis = makeAnalysis({ confidence: 0.5 });
    assert.equal(determineAction(analysis, 'idynic', mockIssue, mockRepoConf), 'notify');
  });

  it('returns notify when repo disables auto-spawn', () => {
    const conf = { ...mockRepoConf, autoSpawnEnabled: false };
    const analysis = makeAnalysis({ confidence: 0.95 });
    assert.equal(determineAction(analysis, 'idynic', mockIssue, conf), 'notify');
  });

  it('returns notify for security-related issues', () => {
    const issue = { ...mockIssue, title: 'Security vulnerability in auth' };
    const analysis = makeAnalysis({ confidence: 0.95 });
    assert.equal(determineAction(analysis, 'idynic', issue, mockRepoConf), 'notify');
  });

  it('returns notify for database migration issues', () => {
    const issue = { ...mockIssue, body: 'Need a database migration to add column' };
    const analysis = makeAnalysis({ confidence: 0.95 });
    assert.equal(determineAction(analysis, 'idynic', issue, mockRepoConf), 'notify');
  });

  it('prioritizes clarification over auto-spawn', () => {
    const analysis = makeAnalysis({ confidence: 0.95, needsClarification: ['Which page?'] });
    assert.equal(determineAction(analysis, 'idynic', mockIssue, mockRepoConf), 'clarify');
  });

  it('returns auto-spawn at exact threshold', () => {
    const analysis = makeAnalysis({ confidence: 0.85 });
    assert.equal(determineAction(analysis, 'idynic', mockIssue, mockRepoConf), 'auto-spawn');
  });

  it('returns offer-fix at exact lower threshold', () => {
    const analysis = makeAnalysis({ confidence: 0.70 });
    assert.equal(determineAction(analysis, 'idynic', mockIssue, mockRepoConf), 'offer-fix');
  });
});
