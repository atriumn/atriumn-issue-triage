import { env } from './config.js';

/**
 * Format a Telegram notification for a new issue.
 * @param {string} repo
 * @param {number} number
 * @param {object} issue
 * @returns {string}
 */
export function formatNewIssueMessage(repo, number, issue) {
  const issueUrl = `https://github.com/atriumn/${repo}/issues/${number}`;
  const body = issue.body || '';
  const preview = body.length > 200 ? body.slice(0, 200) + '...' : body;

  const lines = [
    `\u{1F4CB} New Issue: ${repo}#${number}`,
    issue.title,
    '',
  ];

  if (preview) {
    lines.push(preview, '');
  }

  lines.push(
    `\u{1F517} ${issueUrl}`,
    'Reply /ralph on the issue to auto-fix.',
  );

  return lines.join('\n');
}

/**
 * Format a Telegram notification for Ralph being spawned.
 * @param {string} repo
 * @param {number} number
 * @param {string} issueTitle
 * @returns {string}
 */
export function formatRalphSpawnedMessage(repo, number, issueTitle) {
  return [
    `\u{1F680} Ralph spawned: ${repo}#${number}`,
    issueTitle,
    `Session: ${repo}-${number}`,
  ].join('\n');
}

/**
 * Send a message to Telegram via the Bot API.
 * @param {string} message
 * @returns {Promise<void>}
 */
export async function sendNotification(message) {
  const url = `https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.telegramChatId,
      text: message,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
}

/**
 * Notify about a new issue via Telegram.
 * @param {string} repo
 * @param {number} number
 * @param {object} issue
 * @returns {Promise<void>}
 */
export async function notifyNewIssue(repo, number, issue) {
  const message = formatNewIssueMessage(repo, number, issue);
  await sendNotification(message);
}

/**
 * Notify about Ralph being spawned via Telegram.
 * @param {string} repo
 * @param {number} number
 * @param {string} issueTitle
 * @returns {Promise<void>}
 */
export async function notifyRalphSpawned(repo, number, issueTitle) {
  const message = formatRalphSpawnedMessage(repo, number, issueTitle);
  await sendNotification(message);
}
