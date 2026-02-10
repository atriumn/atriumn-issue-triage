/** @typedef {'high' | 'medium' | 'low'} Priority */
/** @typedef {Object} RepoConfig
 * @property {boolean} enabled
 * @property {boolean} autoSpawnEnabled
 * @property {Priority} priority
 * @property {string} projectDir
 * @property {RegExp[]} noAutoFixPatterns
 */

/** @type {Record<string, RepoConfig>} */
export const repoConfig = {
  idynic: {
    enabled: true,
    autoSpawnEnabled: true,
    priority: 'high',
    projectDir: '/home/jeff/projects/idynic',
    noAutoFixPatterns: [
      /security/i,
      /credentials/i,
      /database.*migration/i,
      /breaking.*change/i,
    ],
  },
  veriumn: {
    enabled: true,
    autoSpawnEnabled: true,
    priority: 'high',
    projectDir: '/home/jeff/projects/veriumn',
    noAutoFixPatterns: [
      /security/i,
      /credentials/i,
      /database.*migration/i,
      /breaking.*change/i,
    ],
  },
  ovrly: {
    enabled: true,
    autoSpawnEnabled: true,
    priority: 'medium',
    projectDir: '/home/jeff/projects/ovrly',
    noAutoFixPatterns: [
      /security/i,
      /credentials/i,
      /database.*migration/i,
      /breaking.*change/i,
    ],
  },
  tariff: {
    enabled: true,
    autoSpawnEnabled: true,
    priority: 'medium',
    projectDir: '/home/jeff/projects/tariff',
    noAutoFixPatterns: [
      /security/i,
      /credentials/i,
      /database.*migration/i,
      /breaking.*change/i,
    ],
  },
  'atriumn-site': {
    enabled: true,
    autoSpawnEnabled: false,
    priority: 'low',
    projectDir: '/home/jeff/projects/atriumn-site',
    noAutoFixPatterns: [
      /security/i,
      /credentials/i,
    ],
  },
};

/** Confidence thresholds for auto-fix decisions */
export const thresholds = {
  /** Auto-spawn Ralph immediately */
  autoSpawn: 0.85,
  /** Offer auto-fix to Jeff (requires approval) */
  offerFix: 0.70,
};

/**
 * Get config for a repo, falling back to disabled defaults.
 * @param {string} repoName
 * @returns {RepoConfig}
 */
export function getRepoConfig(repoName) {
  return repoConfig[repoName] || {
    enabled: false,
    autoSpawnEnabled: false,
    priority: 'low',
    projectDir: '',
    noAutoFixPatterns: [],
  };
}

/**
 * Check if an issue matches any no-auto-fix patterns for a repo.
 * @param {string} repoName
 * @param {string} issueTitle
 * @param {string} issueBody
 * @returns {boolean}
 */
export function matchesNoAutoFix(repoName, issueTitle, issueBody) {
  const config = getRepoConfig(repoName);
  const text = `${issueTitle} ${issueBody}`;
  return config.noAutoFixPatterns.some(pattern => pattern.test(text));
}

/** Environment config — uses getters so tests can set env vars after import */
export const env = {
  get port() { return parseInt(process.env.PORT || '3847', 10); },
  get webhookSecret() { return process.env.GITHUB_WEBHOOK_SECRET || ''; },
  get githubToken() { return process.env.GITHUB_TOKEN || ''; },
  get anthropicApiKey() { return process.env.ANTHROPIC_API_KEY || ''; },
  get stateDir() { return process.env.STATE_DIR || '/var/lib/issue-triage'; },
  get ralphSpawnScript() { return process.env.RALPH_SPAWN_SCRIPT || '/home/jeff/projects/alloy/shared/scripts/ralph-spawn.sh'; },
  get ralphNotifyScript() { return process.env.RALPH_NOTIFY_SCRIPT || '/home/jeff/projects/alloy/shared/scripts/ralph-notify.sh'; },
};
