import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processIssue } from '../src/pipeline.js';

/** @returns {import('../src/config.js').RepoConfig} */
function makeRepoConf(overrides = {}) {
  return {
    enabled: true,
    autoSpawnEnabled: true,
    priority: 'high',
    projectDir: '/home/jeff/projects/idynic',
    noAutoFixPatterns: [/security/i],
    ...overrides,
  };
}

function makeIssue(overrides = {}) {
  return {
    number: 42,
    title: 'Test issue',
    body: 'Test body',
    user: { login: 'testuser' },
    labels: [],
    ...overrides,
  };
}

function makeAnalysis(overrides = {}) {
  return {
    type: 'bug',
    severity: 'high',
    autoFixable: false,
    confidence: 0.8,
    reasoning: 'Test reasoning',
    acceptanceCriteria: ['Fix the bug'],
    needsClarification: [],
    ralphPrompt: null,
    ...overrides,
  };
}

describe('Pipeline', () => {
  describe('processIssue', () => {
    it('calls notifyTriage for notify action', async () => {
      const calls = { triage: 0, notify: 0, spawn: 0, clarify: 0 };
      const analysis = makeAnalysis();

      const result = await processIssue('idynic', 42, makeIssue(), makeRepoConf(), {
        triageIssue: async () => {
          calls.triage++;
          return { analysis, action: 'notify' };
        },
        notifyTriage: async () => { calls.notify++; },
        spawnRalphForIssue: async () => { calls.spawn++; },
        postClarification: async () => { calls.clarify++; },
      });

      assert.equal(calls.triage, 1);
      assert.equal(calls.notify, 1);
      assert.equal(calls.spawn, 0);
      assert.equal(calls.clarify, 0);
      assert.equal(result.action, 'notify');
      assert.deepEqual(result.analysis, analysis);
    });

    it('spawns Ralph and notifies for auto-spawn action', async () => {
      const calls = { notify: 0, spawn: 0, clarify: 0 };
      const analysis = makeAnalysis({
        autoFixable: true,
        confidence: 0.95,
        ralphPrompt: 'Fix the bug in ProfileEdit.tsx',
      });

      const result = await processIssue('idynic', 42, makeIssue(), makeRepoConf(), {
        triageIssue: async () => ({ analysis, action: 'auto-spawn' }),
        notifyTriage: async () => { calls.notify++; },
        spawnRalphForIssue: async (repo, number, a) => {
          calls.spawn++;
          assert.equal(repo, 'idynic');
          assert.equal(number, 42);
          assert.equal(a.ralphPrompt, 'Fix the bug in ProfileEdit.tsx');
        },
        postClarification: async () => { calls.clarify++; },
      });

      assert.equal(calls.spawn, 1);
      assert.equal(calls.notify, 1);
      assert.equal(calls.clarify, 0);
      assert.equal(result.action, 'auto-spawn');
    });

    it('posts clarification and notifies for clarify action', async () => {
      const calls = { notify: 0, spawn: 0, clarify: 0 };
      const questions = ['What browser?', 'Can you share a screenshot?'];
      const analysis = makeAnalysis({ needsClarification: questions });

      const result = await processIssue('ovrly', 7, makeIssue(), makeRepoConf(), {
        triageIssue: async () => ({ analysis, action: 'clarify' }),
        notifyTriage: async () => { calls.notify++; },
        spawnRalphForIssue: async () => { calls.spawn++; },
        postClarification: async (repo, number, qs) => {
          calls.clarify++;
          assert.equal(repo, 'ovrly');
          assert.equal(number, 7);
          assert.deepEqual(qs, questions);
        },
      });

      assert.equal(calls.clarify, 1);
      assert.equal(calls.notify, 1);
      assert.equal(calls.spawn, 0);
      assert.equal(result.action, 'clarify');
    });

    it('notifies only for offer-fix action (no auto-spawn)', async () => {
      const calls = { notify: 0, spawn: 0, clarify: 0 };
      const analysis = makeAnalysis({ autoFixable: true, confidence: 0.75 });

      const result = await processIssue('tariff', 10, makeIssue(), makeRepoConf(), {
        triageIssue: async () => ({ analysis, action: 'offer-fix' }),
        notifyTriage: async () => { calls.notify++; },
        spawnRalphForIssue: async () => { calls.spawn++; },
        postClarification: async () => { calls.clarify++; },
      });

      assert.equal(calls.notify, 1);
      assert.equal(calls.spawn, 0);
      assert.equal(calls.clarify, 0);
      assert.equal(result.action, 'offer-fix');
    });

    it('passes correct args to notifyTriage', async () => {
      const analysis = makeAnalysis();
      const issue = makeIssue({ title: 'My Bug Title' });
      let notifyArgs;

      await processIssue('veriumn', 5, issue, makeRepoConf(), {
        triageIssue: async () => ({ analysis, action: 'notify' }),
        notifyTriage: async (...args) => { notifyArgs = args; },
        spawnRalphForIssue: async () => {},
        postClarification: async () => {},
      });

      assert.equal(notifyArgs[0], 'veriumn');
      assert.equal(notifyArgs[1], 5);
      assert.deepEqual(notifyArgs[2], analysis);
      assert.equal(notifyArgs[3], 'notify');
      assert.equal(notifyArgs[4], 'My Bug Title');
    });

    it('propagates errors from triageIssue', async () => {
      await assert.rejects(
        () => processIssue('idynic', 1, makeIssue(), makeRepoConf(), {
          triageIssue: async () => { throw new Error('API error'); },
          notifyTriage: async () => {},
          spawnRalphForIssue: async () => {},
          postClarification: async () => {},
        }),
        { message: 'API error' },
      );
    });

    it('propagates errors from spawnRalphForIssue', async () => {
      const analysis = makeAnalysis({ autoFixable: true, confidence: 0.95 });

      await assert.rejects(
        () => processIssue('idynic', 1, makeIssue(), makeRepoConf(), {
          triageIssue: async () => ({ analysis, action: 'auto-spawn' }),
          notifyTriage: async () => {},
          spawnRalphForIssue: async () => { throw new Error('Spawn failed'); },
          postClarification: async () => {},
        }),
        { message: 'Spawn failed' },
      );
    });

    it('propagates errors from postClarification', async () => {
      const analysis = makeAnalysis({ needsClarification: ['What?'] });

      await assert.rejects(
        () => processIssue('idynic', 1, makeIssue(), makeRepoConf(), {
          triageIssue: async () => ({ analysis, action: 'clarify' }),
          notifyTriage: async () => {},
          spawnRalphForIssue: async () => {},
          postClarification: async () => { throw new Error('GitHub API error'); },
        }),
        { message: 'GitHub API error' },
      );
    });
  });
});
