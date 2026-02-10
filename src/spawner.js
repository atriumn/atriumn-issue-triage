import { execFile } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { env } from './config.js';

/**
 * @typedef {import('./analyzer.js').AnalysisResult} AnalysisResult
 */

/**
 * Generate a fallback prompt when the analysis doesn't include a Ralph prompt.
 * @param {string} repo
 * @param {number} number
 * @param {AnalysisResult} analysis
 * @returns {string}
 */
export function generateFallbackPrompt(repo, number, analysis) {
  const lines = [
    `Fix GitHub issue atriumn/${repo}#${number}.`,
    '',
    `## Issue Type: ${analysis.type}`,
    `## Severity: ${analysis.severity}`,
    '',
    '## Analysis',
    analysis.reasoning,
  ];

  if (analysis.acceptanceCriteria.length > 0) {
    lines.push('', '## Acceptance Criteria');
    for (const c of analysis.acceptanceCriteria) {
      lines.push(`- ${c}`);
    }
  }

  lines.push('', '## Instructions');
  lines.push('1. Read the relevant code and understand the issue');
  lines.push('2. Implement the fix');
  lines.push('3. Run existing tests to verify nothing breaks');
  lines.push('4. Commit with a clear message referencing the issue');

  return lines.join('\n');
}

/**
 * Spawn Ralph to auto-fix a GitHub issue.
 * Writes the prompt to a temp file, then invokes ralph-spawn.sh.
 * @param {string} repo - Repository name
 * @param {number} number - Issue number
 * @param {AnalysisResult} analysis - Opus analysis result
 * @returns {Promise<void>}
 */
export async function spawnRalphForIssue(repo, number, analysis) {
  const prompt = analysis.ralphPrompt || generateFallbackPrompt(repo, number, analysis);

  const promptFile = `/tmp/issue-${repo}-${number}.txt`;
  await writeFile(promptFile, prompt, 'utf-8');

  const script = env.ralphSpawnScript;

  try {
    await new Promise((resolve, reject) => {
      execFile(
        script,
        ['--project', repo, '--issue', String(number), '--prompt-file', promptFile],
        { timeout: 60_000 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`Ralph spawn failed: ${error.message}${stderr ? ` (${stderr.trim()})` : ''}`));
            return;
          }
          resolve();
        },
      );
    });
  } finally {
    // Clean up temp prompt file (best-effort)
    await unlink(promptFile).catch(() => {});
  }
}
