const test = require('node:test');
const assert = require('node:assert/strict');
const {
	DEFAULT_SETTINGS,
	__test__,
} = require('../services/settingsService');

test('normalizeGitHubOwner strips supported prefixes', () => {
	assert.equal(
		__test__.normalizeGitHubOwner('https://github.com/example-org/'),
		'example-org',
	);
	assert.equal(__test__.normalizeGitHubOwner('@octocat'), 'octocat');
	assert.equal(
		__test__.normalizeGitHubOwner('github.com/OpenAI/docs'),
		'OpenAI',
	);
});

test('normalizeVisibility falls back to private for invalid values', () => {
	assert.equal(__test__.normalizeVisibility('public'), 'public');
	assert.equal(
		__test__.normalizeVisibility('internal'),
		DEFAULT_SETTINGS.github.visibility,
	);
});

test('normalizeTerminalSettings keeps manual commands disabled by default', () => {
	assert.deepEqual(
		__test__.normalizeTerminalSettings({}, DEFAULT_SETTINGS.terminal),
		{
			allowManualCommands: false,
		},
	);
});

test('normalizeSettings merges github and terminal defaults', () => {
	const normalized = __test__.normalizeSettings({
		github: {
			owner: 'https://github.com/dashboard-team/',
			visibility: 'public',
		},
		terminal: {
			allowManualCommands: true,
		},
	});

	assert.equal(normalized.github.owner, 'dashboard-team');
	assert.equal(normalized.github.visibility, 'public');
	assert.equal(normalized.github.autoCreateRepo, true);
	assert.equal(normalized.terminal.allowManualCommands, true);
});
