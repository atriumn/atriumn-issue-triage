import { execFile } from 'node:child_process';
import { env } from './config.js';

/**
 * @typedef {import('./analyzer.js').AnalysisResult} AnalysisResult
 * @typedef {import('./analyzer.js').TriageAction} TriageAction
 */

const TYPE_EMOJI = {
  bug: '\u{1F41B}',
  feature: '\u{2728}',
  enhancement: '\u{1F4A1}',
  question: '\u{2753}',
  docs: '\u{1F4DD}',
  chore: '\u{1F9F9}',
};

const SEVERITY_LABEL = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

/**
 * Format a Telegram notification message.
 * @param {string} repo
 * @param {number} number
 * @param {AnalysisResult} analysis
 * @param {TriageAction} action
 * @param {string} issueTitle
 * @returns {string}
 */
export function formatMessage(repo, number, analysis, action, issueTitle) {
  const emoji = TYPE_EMOJI[analysis.type] || '\u{1F4CB}';
  const severity = SEVERITY_LABEL[analysis.severity] || analysis.severity;
  const confidence = Math.round(analysis.confidence * 100);
  const issueUrl = `https://github.com/atriumn/${repo}/issues/${number}`;

  let header;
  switch (action) {
    case 'auto-spawn':
      header = `\u{1F527} Auto-fixing ${repo}#${number}`;
      break;
    case 'offer-fix':
      header = `\u{1F916} Auto-fix available: ${repo}#${number}`;
      break;
    case 'clarify':
      header = `\u{2753} Issue needs clarification: ${repo}#${number}`;
      break;
    default:
      header = `${emoji} New Issue: ${repo}#${number}`;
  }

  const lines = [
    header,
    '',
    `Title: ${issueTitle}`,
    `Type: ${analysis.type.toUpperCase()} | Severity: ${severity}`,
    `Confidence: ${confidence}%`,
    '',
    `Analysis:`,
    analysis.reasoning,
  ];

  if (action === 'clarify' && analysis.needsClarification.length > 0) {
    lines.push('', 'Questions:');
    for (const q of analysis.needsClarification) {
      lines.push(`- ${q}`);
    }
  }

  if (analysis.acceptanceCriteria.length > 0 && action !== 'clarify') {
    lines.push('', 'Acceptance Criteria:');
    for (const c of analysis.acceptanceCriteria) {
      lines.push(`- ${c}`);
    }
  }

  lines.push('', issueUrl);

  return lines.join('\n');
}

/**
 * Send a notification using ralph-notify.sh.
 * @param {string} message
 * @returns {Promise<void>}
 */
export function sendNotification(message) {
  const script = env.ralphNotifyScript;

  return new Promise((resolve, reject) => {
    execFile(script, [message], { timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Notification failed: ${error.message}${stderr ? ` (${stderr.trim()})` : ''}`));
        return;
      }
      resolve();
    });
  });
}

/**
 * Format and send a triage notification to Telegram.
 * @param {string} repo
 * @param {number} number
 * @param {AnalysisResult} analysis
 * @param {TriageAction} action
 * @param {string} issueTitle
 * @returns {Promise<void>}
 */
export async function notifyTriage(repo, number, analysis, action, issueTitle) {
  const message = formatMessage(repo, number, analysis, action, issueTitle);
  await sendNotification(message);
}
