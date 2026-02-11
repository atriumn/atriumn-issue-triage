import { execFile } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { env } from './config.js';

/**
 * Build the prompt for Ralph from an issue.
 * @param {string} repo
 * @param {number} number
 * @param {object} issue
 * @returns {string}
 */
export function buildPrompt(repo, number, issue) {
  return `Fix GitHub issue atriumn/${repo}#${number}:
"${issue.title}"

${issue.body || '(no description)'}

Open a PR when done. Reference the issue in the PR description.`;
}

/**
 * Spawn Ralph to fix a GitHub issue.
 * Writes the prompt to a file under /home/jeff (shared with container),
 * then docker execs into alloy-jeff to run ralph-spawn.sh so Ralph
 * lives in the container alongside OpenClaw.
 * @param {string} repo
 * @param {number} number
 * @param {object} issue
 * @returns {Promise<void>}
 */
export async function spawnRalph(repo, number, issue) {
  const prompt = buildPrompt(repo, number, issue);
  // Write under project dir (in service's ReadWritePaths) — visible inside container via /home/jeff mount
  const promptFile = `/home/jeff/projects/atriumn-issue-triage/.prompts/issue-${repo}-${number}.txt`;
  await writeFile(promptFile, prompt, 'utf-8');

  const script = env.ralphSpawnScript;
  const container = env.ralphContainer;

  try {
    await new Promise((resolve, reject) => {
      execFile(
        'docker', ['exec', container,
          script,
          '--project', repo, '--issue', String(number), '--prompt-file', promptFile,
        ],
        { timeout: 120_000 },
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
    await unlink(promptFile).catch(() => {});
  }
}
