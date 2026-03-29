const { loadSettings, saveSettings } = require('../utils/fileOperations');

const DEFAULT_SETTINGS = Object.freeze({
	github: {
		autoCreateRepo: true,
		owner: '',
		token: '',
		visibility: 'private',
	},
});

function normalizeVisibility(value, fallback = DEFAULT_SETTINGS.github.visibility) {
	if (value === 'public' || value === 'private') {
		return value;
	}

	return fallback;
}

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

function normalizeGitHubSettings(input = {}, existing = DEFAULT_SETTINGS.github) {
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

function normalizeSettings(input = {}) {
	const existingGitHub = normalizeGitHubSettings(
		input.github,
		DEFAULT_SETTINGS.github,
	);

	return {
		github: existingGitHub,
	};
}

function getSettings() {
	return normalizeSettings(loadSettings());
}

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

function getPublicSettings() {
	return getPublicSettingsFromValue(getSettings());
}

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
