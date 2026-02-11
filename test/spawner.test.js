import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../src/spawner.js';

function makeIssue(overrides = {}) {
  return {
    title: 'TypeError in ProfileEdit.tsx',
    body: 'Getting a TypeError when loading the profile page for new users without avatars.',
    ...overrides,
  };
}

describe('buildPrompt', () => {
  it('includes repo and issue number', () => {
    const prompt = buildPrompt('idynic', 42, makeIssue());
    assert.ok(prompt.includes('atriumn/idynic#42'));
  });

  it('includes issue title in quotes', () => {
    const prompt = buildPrompt('idynic', 42, makeIssue());
    assert.ok(prompt.includes('"TypeError in ProfileEdit.tsx"'));
  });

  it('includes issue body', () => {
    const prompt = buildPrompt('idynic', 42, makeIssue());
    assert.ok(prompt.includes('Getting a TypeError when loading the profile page'));
  });

  it('handles empty body', () => {
    const prompt = buildPrompt('idynic', 42, makeIssue({ body: '' }));
    assert.ok(prompt.includes('(no description)'));
  });

  it('handles null body', () => {
    const prompt = buildPrompt('idynic', 42, makeIssue({ body: null }));
    assert.ok(prompt.includes('(no description)'));
  });

  it('includes PR instruction', () => {
    const prompt = buildPrompt('idynic', 42, makeIssue());
    assert.ok(prompt.includes('Open a PR when done'));
    assert.ok(prompt.includes('Reference the issue in the PR description'));
  });

  it('works with different repos', () => {
    const prompt = buildPrompt('ovrly', 10, makeIssue({ title: 'Fix layout' }));
    assert.ok(prompt.includes('atriumn/ovrly#10'));
    assert.ok(prompt.includes('"Fix layout"'));
  });
});
