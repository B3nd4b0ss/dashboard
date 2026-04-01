const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { PROJECTS_DIR } = require('../config/constants');
const {
	buildProjectPath,
	getProjectLocation,
	getProjectPath,
	isPathInside,
	pathsEqual,
	resolveProjectLocationInput,
} = require('../utils/projectPaths');

test('resolveProjectLocationInput defaults to the shared projects directory', () => {
	assert.equal(resolveProjectLocationInput(''), PROJECTS_DIR);
	assert.equal(resolveProjectLocationInput('   '), PROJECTS_DIR);
});

test('resolveProjectLocationInput supports relative project roots', () => {
	assert.equal(
		resolveProjectLocationInput('team/workspaces'),
		path.resolve(PROJECTS_DIR, 'team/workspaces'),
	);
});

test('resolveProjectLocationInput rejects malformed Windows drive syntax', () => {
	assert.throws(
		() => resolveProjectLocationInput('C:Projects'),
		/absolute folder path/i,
	);
});

test('buildProjectPath trims the project name and joins it to the chosen location', () => {
	assert.equal(
		buildProjectPath('  Dashboard  ', 'sandbox'),
		path.join(path.resolve(PROJECTS_DIR, 'sandbox'), 'Dashboard'),
	);
});

test('getProjectPath and getProjectLocation respect persisted projectPath values', () => {
	const persistedPath = path.resolve(
		PROJECTS_DIR,
		'..',
		'custom-root',
		'Acme',
	);

	assert.equal(
		getProjectPath({ name: 'Ignored', projectPath: persistedPath }),
		persistedPath,
	);
	assert.equal(
		getProjectPath({ name: 'Fallback Project' }),
		path.join(PROJECTS_DIR, 'Fallback Project'),
	);
	assert.equal(
		getProjectLocation({ name: 'Ignored', projectPath: persistedPath }),
		path.dirname(persistedPath),
	);
});

test('pathsEqual and isPathInside handle normalized filesystem comparisons', () => {
	const rootPath = path.resolve(PROJECTS_DIR, 'workspace');
	const insidePath = path.join(rootPath, 'src', '..', 'src', 'App.jsx');
	const outsidePath = path.resolve(rootPath, '..', 'workspace-copy');

	assert.equal(pathsEqual(rootPath, path.join(rootPath, '.')), true);
	assert.equal(isPathInside(rootPath, rootPath), true);
	assert.equal(isPathInside(insidePath, rootPath), true);
	assert.equal(isPathInside(outsidePath, rootPath), false);
});
