const path = require('path');
const { PROJECTS_DIR } = require('../config/constants');

function normalizeComparablePath(value) {
	const resolved = path.resolve(String(value || ''));
	return process.platform === 'win32'
		? resolved.toLowerCase()
		: resolved;
}

function assertValidProjectLocation(location) {
	const value = String(location || '');

	if (value.includes('\0')) {
		throw new Error('Invalid project location');
	}

	if (/^[a-zA-Z]:[^\\/]/.test(value.trim())) {
		throw new Error(
			'Use an absolute folder path like C:\\Projects or a relative path.',
		);
	}
}

function resolveProjectLocationInput(location = '') {
	const trimmed = String(location || '').trim();
	if (!trimmed) {
		return PROJECTS_DIR;
	}

	assertValidProjectLocation(trimmed);

	if (path.isAbsolute(trimmed)) {
		return path.resolve(trimmed);
	}

	return path.resolve(PROJECTS_DIR, trimmed);
}

function buildProjectPath(projectName, projectLocation = '') {
	const trimmedName = String(projectName || '').trim();
	if (!trimmedName) {
		throw new Error('Project name is required');
	}

	return path.join(resolveProjectLocationInput(projectLocation), trimmedName);
}

function getProjectPath(project = {}) {
	if (project.projectPath) {
		return path.resolve(project.projectPath);
	}

	return path.join(PROJECTS_DIR, project.name || '');
}

function getProjectLocation(project = {}) {
	return path.dirname(getProjectPath(project));
}

function pathsEqual(leftPath, rightPath) {
	return (
		normalizeComparablePath(leftPath) ===
		normalizeComparablePath(rightPath)
	);
}

function isPathInside(candidatePath, rootPath) {
	const normalizedRoot = normalizeComparablePath(rootPath);
	const normalizedCandidate = normalizeComparablePath(candidatePath);
	const rootPrefix = `${normalizedRoot}${path.sep}`;

	return (
		normalizedCandidate === normalizedRoot ||
		normalizedCandidate.startsWith(rootPrefix)
	);
}

module.exports = {
	buildProjectPath,
	getProjectLocation,
	getProjectPath,
	isPathInside,
	pathsEqual,
	resolveProjectLocationInput,
};
