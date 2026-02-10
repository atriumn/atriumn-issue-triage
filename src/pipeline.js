import { triageIssue } from './analyzer.js';
import { notifyTriage } from './notifier.js';
import { spawnRalphForIssue } from './spawner.js';
import { postClarification } from './clarifier.js';

/**
 * @typedef {Object} PipelineResult
 * @property {import('./analyzer.js').TriageAction} action
 * @property {import('./analyzer.js').AnalysisResult} analysis
 */

/**
 * @typedef {Object} PipelineDeps
 * @property {typeof triageIssue} [triageIssue]
 * @property {typeof notifyTriage} [notifyTriage]
 * @property {typeof spawnRalphForIssue} [spawnRalphForIssue]
 * @property {typeof postClarification} [postClarification]
 */

/**
 * Process an issue through the triage pipeline.
 * Accepts optional dependency overrides for testing.
 * @param {string} repo
 * @param {number} number
 * @param {object} issue
 * @param {import('./config.js').RepoConfig} repoConf
 * @param {PipelineDeps} [deps]
 * @returns {Promise<PipelineResult>}
 */
export async function processIssue(repo, number, issue, repoConf, deps = {}) {
  const _triageIssue = deps.triageIssue || triageIssue;
  const _notifyTriage = deps.notifyTriage || notifyTriage;
  const _spawnRalphForIssue = deps.spawnRalphForIssue || spawnRalphForIssue;
  const _postClarification = deps.postClarification || postClarification;

  // Step 1: Analyze with Opus and determine action
  const { analysis, action } = await _triageIssue(issue, repo, repoConf);

  // Step 2: Execute action
  switch (action) {
    case 'clarify':
      await _postClarification(repo, number, analysis.needsClarification);
      break;

    case 'auto-spawn':
      await _spawnRalphForIssue(repo, number, analysis);
      break;

    case 'offer-fix':
    case 'notify':
      // No extra action beyond notification
      break;
  }

  // Step 3: Always notify Jeff via Telegram
  await _notifyTriage(repo, number, analysis, action, issue.title);

  return { action, analysis };
}
