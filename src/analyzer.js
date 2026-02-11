import Anthropic from '@anthropic-ai/sdk';
import { env, thresholds, matchesNoAutoFix } from './config.js';

/** @type {Anthropic|null} */
let client = null;

function getClient() {
  if (!client) {
    // Anthropic SDK auto-detects CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY
    client = new Anthropic();
  }
  return client;
}

/**
 * @typedef {Object} AnalysisResult
 * @property {'bug' | 'feature' | 'enhancement' | 'question' | 'docs' | 'chore'} type
 * @property {'critical' | 'high' | 'medium' | 'low'} severity
 * @property {boolean} autoFixable
 * @property {number} confidence - 0.0 to 1.0
 * @property {string} reasoning
 * @property {string[]} acceptanceCriteria
 * @property {string[]} needsClarification
 * @property {string|null} ralphPrompt
 */

/**
 * @typedef {'auto-spawn' | 'offer-fix' | 'notify' | 'clarify'} TriageAction
 */

/**
 * @typedef {Object} TriageResult
 * @property {AnalysisResult} analysis
 * @property {TriageAction} action
 */

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['bug', 'feature', 'enhancement', 'question', 'docs', 'chore'] },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    autoFixable: { type: 'boolean' },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    needsClarification: { type: 'array', items: { type: 'string' } },
    ralphPrompt: { type: ['string', 'null'] },
  },
  required: ['type', 'severity', 'autoFixable', 'confidence', 'reasoning', 'acceptanceCriteria', 'needsClarification', 'ralphPrompt'],
};

/**
 * Build the analysis prompt for Opus.
 * @param {object} issue - GitHub issue object
 * @param {string} repo - Repository name
 * @param {import('./config.js').RepoConfig} repoConf
 * @returns {string}
 */
export function buildAnalysisPrompt(issue, repo, repoConf) {
  const labels = (issue.labels || []).map(l => l.name || l).join(', ') || 'none';

  return `You are an expert software engineer triaging a GitHub issue for the ${repo} project.

## Issue Details
- **Repository:** atriumn/${repo}
- **Issue #${issue.number}:** ${issue.title}
- **Author:** ${issue.user?.login || 'unknown'}
- **Labels:** ${labels}

### Issue Body
${issue.body || '(empty)'}

## Project Location
The project code is at: ${repoConf.projectDir}

## Your Task
Analyze this issue deeply. Consider:
1. What type of issue is this? (bug, feature, enhancement, question, docs, chore)
2. How severe is it? (critical, high, medium, low)
3. Can this be auto-fixed by an AI coding agent (Ralph)?
4. What are clear acceptance criteria?
5. Is clarification needed from the reporter?

## Auto-Fix Guidelines
Be CONSERVATIVE with autoFixable. Only mark true if:
- The issue is clear and well-defined
- A fix can be implemented without ambiguity
- It does NOT involve security changes, credential handling, database migrations, or breaking changes
- You are confident an AI agent can implement and test the fix autonomously
- The fix scope is reasonable (not a major refactor)

If autoFixable is true, provide a detailed ralphPrompt that an AI coding agent can use to implement the fix. The prompt should include:
- What files to modify
- What the expected behavior should be
- How to verify the fix (tests to run)

## Clarification
If the issue is too vague to understand or act on, add specific questions to needsClarification.
Only ask for clarification when truly needed — try to infer intent from context first.

## Output
Respond with a JSON object matching this exact structure:
{
  "type": "bug|feature|enhancement|question|docs|chore",
  "severity": "critical|high|medium|low",
  "autoFixable": boolean,
  "confidence": number (0.0-1.0),
  "reasoning": "Brief analysis explaining your assessment",
  "acceptanceCriteria": ["criterion 1", "criterion 2"],
  "needsClarification": ["question 1"] or [],
  "ralphPrompt": "Detailed prompt for Ralph" or null
}

Respond ONLY with the JSON object, no markdown fences or other text.`;
}

/**
 * Parse and validate the analysis result from Opus.
 * @param {string} text - Raw text response from Opus
 * @returns {AnalysisResult}
 */
export function parseAnalysisResult(text) {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  const parsed = JSON.parse(cleaned);

  // Validate required fields
  const required = ['type', 'severity', 'autoFixable', 'confidence', 'reasoning', 'acceptanceCriteria', 'needsClarification', 'ralphPrompt'];
  for (const field of required) {
    if (!(field in parsed)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate types
  const validTypes = ['bug', 'feature', 'enhancement', 'question', 'docs', 'chore'];
  if (!validTypes.includes(parsed.type)) {
    throw new Error(`Invalid type: ${parsed.type}`);
  }

  const validSeverities = ['critical', 'high', 'medium', 'low'];
  if (!validSeverities.includes(parsed.severity)) {
    throw new Error(`Invalid severity: ${parsed.severity}`);
  }

  if (typeof parsed.autoFixable !== 'boolean') {
    throw new Error('autoFixable must be a boolean');
  }

  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
    throw new Error('confidence must be a number between 0 and 1');
  }

  if (!Array.isArray(parsed.acceptanceCriteria)) {
    throw new Error('acceptanceCriteria must be an array');
  }

  if (!Array.isArray(parsed.needsClarification)) {
    throw new Error('needsClarification must be an array');
  }

  return parsed;
}

/**
 * Analyze a GitHub issue using Claude Opus.
 * @param {object} issue - GitHub issue object
 * @param {string} repo - Repository name
 * @param {import('./config.js').RepoConfig} repoConf
 * @returns {Promise<AnalysisResult>}
 */
export async function analyzeIssue(issue, repo, repoConf) {
  const prompt = buildAnalysisPrompt(issue, repo, repoConf);

  const message = await getClient().messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  return parseAnalysisResult(text);
}

/**
 * Determine the triage action based on analysis results and repo config.
 * @param {AnalysisResult} analysis
 * @param {string} repo
 * @param {object} issue
 * @param {import('./config.js').RepoConfig} repoConf
 * @returns {TriageAction}
 */
export function determineAction(analysis, repo, issue, repoConf) {
  // If clarification needed, always ask first
  if (analysis.needsClarification.length > 0) {
    return 'clarify';
  }

  // If not auto-fixable, just notify
  if (!analysis.autoFixable) {
    return 'notify';
  }

  // Check no-auto-fix patterns (security, migrations, etc.)
  if (matchesNoAutoFix(repo, issue.title || '', issue.body || '')) {
    return 'notify';
  }

  // Check if repo allows auto-spawn
  if (!repoConf.autoSpawnEnabled) {
    return 'notify';
  }

  // High confidence → auto-spawn
  if (analysis.confidence >= thresholds.autoSpawn) {
    return 'auto-spawn';
  }

  // Medium confidence → offer fix
  if (analysis.confidence >= thresholds.offerFix) {
    return 'offer-fix';
  }

  // Low confidence → just notify
  return 'notify';
}

/**
 * Full triage pipeline: analyze issue and determine action.
 * @param {object} issue
 * @param {string} repo
 * @param {import('./config.js').RepoConfig} repoConf
 * @returns {Promise<TriageResult>}
 */
export async function triageIssue(issue, repo, repoConf) {
  const analysis = await analyzeIssue(issue, repo, repoConf);
  const action = determineAction(analysis, repo, issue, repoConf);
  return { analysis, action };
}
