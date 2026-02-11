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
 * Writes the prompt to a temp file, then invokes ralph-spawn.sh
 * via systemd-run so Ralph runs in its own cgroup (not under the
 * triage service's memory limit).
 * @param {string} repo
 * @param {number} number
 * @param {object} issue
 * @returns {Promise<void>}
 */
export async function spawnRalph(repo, number, issue) {
  const prompt = buildPrompt(repo, number, issue);
  const promptFile = `/tmp/issue-${repo}-${number}.txt`;
  await writeFile(promptFile, prompt, 'utf-8');

  const script = env.ralphSpawnScript;

  try {
    await new Promise((resolve, reject) => {
      execFile(
        'systemd-run',
        [
          '--user', '--scope',
          '--unit', `ralph-${repo}-${number}`,
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
