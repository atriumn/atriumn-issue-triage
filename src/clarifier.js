import { env } from './config.js';

const GITHUB_API = 'https://api.github.com';
const ORG = 'atriumn';

/**
 * Format clarification questions into a GitHub comment body.
 * @param {string[]} questions
 * @returns {string}
 */
export function formatClarificationComment(questions) {
  const numbered = questions
    .map((q, i) => `${i + 1}. ${q}`)
    .join('\n');

  return `## \u{1F914} Need More Information

I analyzed this issue but need clarification on a few points:

${numbered}

Once clarified, I can likely auto-fix this. Thanks!

---
*Posted by [atriumn-issue-triage](https://github.com/atriumn/atriumn-issue-triage)*`;
}

/**
 * Post a comment on a GitHub issue.
 * @param {string} repo - Repository name (without org prefix)
 * @param {number} number - Issue number
 * @param {string} body - Comment body (markdown)
 * @returns {Promise<void>}
 */
export async function postComment(repo, number, body) {
  const token = env.githubToken;
  if (!token) {
    throw new Error('GITHUB_TOKEN not configured');
  }

  const url = `${GITHUB_API}/repos/${ORG}/${repo}/issues/${number}/comments`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub API error ${response.status}: ${text}`);
  }
}

/**
 * Post clarifying questions as a GitHub issue comment.
 * @param {string} repo - Repository name
 * @param {number} number - Issue number
 * @param {string[]} questions - Questions to ask
 * @returns {Promise<void>}
 */
export async function postClarification(repo, number, questions) {
  const comment = formatClarificationComment(questions);
  await postComment(repo, number, comment);
}
