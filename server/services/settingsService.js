const { loadSettings, saveSettings } = require('../utils/fileOperations');

const DEFAULT_SETTINGS = Object.freeze({
	github: {
		autoCreateRepo: true,
		owner: '',
		token: '',
		visibility: 'private',
	},
});

/**
 * Ensures GitHub repository visibility only uses supported values.
 *
 * @param {string} value - Raw visibility value from the client.
 * @param {string} [fallback=DEFAULT_SETTINGS.github.visibility] - Value to use when the input is invalid.
 * @returns {string} `public` or `private`.
 */
function normalizeVisibility(
	value,
	fallback = DEFAULT_SETTINGS.github.visibility,
) {
	if (value === 'public' || value === 'private') {
		return value;
	}

	return fallback;
}

/**
 * Normalizes the GitHub owner field so users can paste `@name` or a GitHub URL.
 *
 * @param {unknown} value - Raw owner input from the client.
 * @param {string} [fallback=''] - Value to use when the input is missing.
 * @returns {string} Clean owner name without URL or `@` prefixes.
 */
function normalizeGitHubOwner(value, fallback = '') {
	if (typeof value !== 'string') {
		return fallback;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return fallback;
	}

	const withoutPrefix = trimmed
		.replace(/^https?:\/\/github\.com\//i, '')
		.replace(/^github\.com\//i, '')
		.replace(/^@/, '');
	const normalized = withoutPrefix.split(/[/?#]/)[0]?.trim();

	return normalized || fallback;
}

/**
 * Merges raw GitHub settings input with existing values and normalizes each field.
 *
 * @param {object} [input={}] - Partial GitHub settings payload.
 * @param {object} [existing=DEFAULT_SETTINGS.github] - Existing GitHub settings used as defaults.
 * @returns {{autoCreateRepo: boolean, owner: string, token: string, visibility: string}} Normalized GitHub settings.
 */
function normalizeGitHubSettings(
	input = {},
	existing = DEFAULT_SETTINGS.github,
) {
	return {
		autoCreateRepo:
			typeof input.autoCreateRepo === 'boolean'
				? input.autoCreateRepo
				: existing.autoCreateRepo,
		owner: normalizeGitHubOwner(input.owner, existing.owner || ''),
		token:
			typeof input.token === 'string'
				? input.token.trim()
				: existing.token || '',
		visibility: normalizeVisibility(input.visibility, existing.visibility),
	};
}

/**
 * Normalizes the full settings document loaded from disk or received from the client.
 *
 * @param {object} [input={}] - Partial raw settings object.
 * @returns {{github: object}} Normalized settings object with all required sections.
 */
function normalizeSettings(input = {}) {
	const existingGitHub = normalizeGitHubSettings(
		input.github,
		DEFAULT_SETTINGS.github,
	);

	return {
		github: existingGitHub,
	};
}

/**
 * Loads and normalizes the persisted private settings.
 *
 * @returns {{github: object}} Full normalized settings, including sensitive values such as the GitHub token.
 */
function getSettings() {
	return normalizeSettings(loadSettings());
}

/**
 * Builds the safe settings payload returned to the client.
 *
 * @param {{github: object}} settings - Normalized settings object that may contain secrets.
 * @returns {{github: {autoCreateRepo: boolean, owner: string, visibility: string, hasToken: boolean}}} Public settings without the raw token.
 */
function getPublicSettingsFromValue(settings) {
	return {
		github: {
			autoCreateRepo: settings.github.autoCreateRepo,
			owner: settings.github.owner,
			visibility: settings.github.visibility,
			hasToken: Boolean(settings.github.token),
		},
	};
}

/**
 * Loads the public settings payload for API responses.
 *
 * @returns {{github: {autoCreateRepo: boolean, owner: string, visibility: string, hasToken: boolean}}} Client-safe settings data.
 */
function getPublicSettings() {
	return getPublicSettingsFromValue(getSettings());
}

/**
 * Applies partial settings updates and persists the result.
 *
 * @param {{github?: {autoCreateRepo?: boolean, owner?: string, visibility?: string, token?: string, clearToken?: boolean}}} [updates={}] - Partial settings payload from the client.
 * @returns {{github: {autoCreateRepo: boolean, owner: string, visibility: string, hasToken: boolean}}} Updated public settings payload.
 */
function updateSettings(updates = {}) {
	const current = getSettings();
	const githubUpdates = updates.github || {};
	const nextSettings = {
		github: {
			...current.github,
			autoCreateRepo:
				typeof githubUpdates.autoCreateRepo === 'boolean'
					? githubUpdates.autoCreateRepo
					: current.github.autoCreateRepo,
			owner: normalizeGitHubOwner(
				githubUpdates.owner,
				current.github.owner,
			),
			visibility:
				typeof githubUpdates.visibility === 'string'
					? normalizeVisibility(
							githubUpdates.visibility,
							current.github.visibility,
						)
					: current.github.visibility,
			token:
				typeof githubUpdates.token === 'string'
					? githubUpdates.token.trim()
					: current.github.token,
		},
	};

	if (githubUpdates.clearToken) {
		nextSettings.github.token = '';
	}

	saveSettings(nextSettings);
	return getPublicSettingsFromValue(nextSettings);
}

/**
 * Returns the private GitHub settings block for internal services.
 *
 * @returns {{autoCreateRepo: boolean, owner: string, token: string, visibility: string}} Normalized GitHub settings including the token.
 */
function getGitHubSettings() {
	return getSettings().github;
}

module.exports = {
	DEFAULT_SETTINGS,
	getGitHubSettings,
	getPublicSettings,
	getSettings,
	updateSettings,
};
