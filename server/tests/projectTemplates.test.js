const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
	getBackendWorkspacePath,
	getFrontendWorkspacePath,
	getFrontendCommandPresetWorkingDirectory,
	getProjectCommandPresets,
} = require('../services/projectTemplates');

function createTempProject(project) {
	const projectPath = fs.mkdtempSync(path.join(__dirname, 'tmp-project-'));
	return {
		projectPath,
		project: {
			name: 'Example Project',
			projectPath,
			...project,
		},
	};
}

test('plain HTML projects default to the client folder for new workspaces', (t) => {
	const { projectPath, project } = createTempProject({
		frontend: 'plain-html',
	});
	t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));

	assert.equal(
		getFrontendWorkspacePath(project),
		path.join(projectPath, 'client'),
	);
	assert.equal(getFrontendCommandPresetWorkingDirectory(project), 'client');

	const previewPreset = getProjectCommandPresets(project).find(
		(preset) => preset.id === 'frontend-preview',
	);
	assert.equal(previewPreset?.cwd, 'client');
	assert.equal(previewPreset?.cwdLabel, 'client');
});

test('plain HTML projects keep using the legacy frontend folder when it already exists', (t) => {
	const { projectPath, project } = createTempProject({
		frontend: 'plain-html',
	});
	const legacyFrontendPath = path.join(projectPath, 'frontend');
	fs.mkdirSync(legacyFrontendPath);
	t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));

	assert.equal(getFrontendWorkspacePath(project), legacyFrontendPath);
	assert.equal(getFrontendCommandPresetWorkingDirectory(project), 'frontend');
});

test('plain HTML projects keep using the project root for older root-based layouts', (t) => {
	const { projectPath, project } = createTempProject({
		frontend: 'plain-html',
	});
	fs.writeFileSync(path.join(projectPath, 'index.html'), '<!doctype html>');
	t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));

	assert.equal(getFrontendWorkspacePath(project), projectPath);
	assert.equal(getFrontendCommandPresetWorkingDirectory(project), '');
});

test('Vite frontend projects default to the client workspace folder', (t) => {
	const { projectPath, project } = createTempProject({
		frontend: 'vite-react',
	});
	t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));

	assert.equal(
		getFrontendWorkspacePath(project),
		path.join(projectPath, 'client'),
	);
	assert.equal(getFrontendCommandPresetWorkingDirectory(project), 'client');
});

test('managed backend projects default to the server workspace folder', (t) => {
	const { projectPath, project } = createTempProject({
		backend: 'node',
	});
	t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));

	assert.equal(
		getBackendWorkspacePath(project),
		path.join(projectPath, 'server'),
	);

	const backendPreset = getProjectCommandPresets(project).find(
		(preset) => preset.id === 'backend-dev',
	);
	assert.equal(backendPreset?.cwd, 'server');
	assert.equal(backendPreset?.cwdLabel, 'server');
});

test('managed backend projects keep using the legacy backend folder when it already exists', (t) => {
	const { projectPath, project } = createTempProject({
		backend: 'node',
	});
	const legacyBackendPath = path.join(projectPath, 'backend');
	fs.mkdirSync(legacyBackendPath);
	t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));

	assert.equal(getBackendWorkspacePath(project), legacyBackendPath);
});

test('java console projects still use the project root when no server folder exists', (t) => {
	const { projectPath, project } = createTempProject({
		backend: 'java-console',
	});
	t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));

	assert.equal(getBackendWorkspacePath(project), projectPath);
});
