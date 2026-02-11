/** @typedef {Object} RepoConfig
 * @property {boolean} enabled
 * @property {string} projectDir
 */

/** @type {Record<string, RepoConfig>} */
export const repoConfig = {
  idynic: {
    enabled: true,
    projectDir: '/home/jeff/projects/idynic',
  },
  veriumn: {
    enabled: true,
    projectDir: '/home/jeff/projects/veriumn',
  },
  ovrly: {
    enabled: true,
    projectDir: '/home/jeff/projects/ovrly',
  },
  tariff: {
    enabled: true,
    projectDir: '/home/jeff/projects/tariff',
  },
  'atriumn-site': {
    enabled: true,
    projectDir: '/home/jeff/projects/atriumn-site',
  },
};

/**
 * Get config for a repo, falling back to disabled defaults.
 * @param {string} repoName
 * @returns {RepoConfig}
 */
export function getRepoConfig(repoName) {
  return repoConfig[repoName] || { enabled: false, projectDir: '' };
}

/** Environment config — uses getters so tests can set env vars after import */
export const env = {
  get port() { return parseInt(process.env.PORT || '3847', 10); },
  get webhookSecret() { return process.env.GITHUB_WEBHOOK_SECRET || ''; },
  get telegramBotToken() { return process.env.TELEGRAM_BOT_TOKEN || ''; },
  get telegramChatId() { return process.env.TELEGRAM_CHAT_ID || ''; },
  get ralphSpawnScript() { return process.env.RALPH_SPAWN_SCRIPT || '/home/jeff/projects/alloy/shared/scripts/ralph-spawn.sh'; },
  get ralphContainer() { return process.env.RALPH_CONTAINER || 'alloy-jeff'; },
};
