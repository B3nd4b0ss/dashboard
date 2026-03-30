const path = require('path');
const { PROJECTS_DIR } = require('../config/constants');

/**
 * Normalizes a path so path equality checks behave consistently across platforms.
 *
 * @param {string} value - Raw path to compare.
 * @returns {string} Resolved path, lower-cased on Windows.
 */
function normalizeComparablePath(value) {
	const resolved = path.resolve(String(value || ''));
	return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Rejects malformed project location input before it is resolved on disk.
 *
 * @param {string} location - Absolute or relative project location entered by the user.
 * @returns {void}
 */
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

/**
 * Resolves the folder where a project should live.
 *
 * @param {string} [location=''] - Optional absolute path or path relative to the projects root.
 * @returns {string} Absolute location that should contain the project folder.
 */
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

/**
 * Builds the absolute on-disk path for a project folder.
 *
 * @param {string} projectName - Project name that becomes the folder name.
 * @param {string} [projectLocation=''] - Optional absolute or relative parent directory.
 * @returns {string} Absolute project folder path.
 */
function buildProjectPath(projectName, projectLocation = '') {
	const trimmedName = String(projectName || '').trim();
	if (!trimmedName) {
		throw new Error('Project name is required');
	}

	return path.join(resolveProjectLocationInput(projectLocation), trimmedName);
}

/**
 * Resolves a persisted project record to its workspace path.
 *
 * @param {object} [project={}] - Project record that may already contain `projectPath`.
 * @returns {string} Absolute path to the project workspace.
 */
function getProjectPath(project = {}) {
	if (project.projectPath) {
		return path.resolve(project.projectPath);
	}

	return path.join(PROJECTS_DIR, project.name || '');
}

/**
 * Resolves the parent directory that contains the project workspace.
 *
 * @param {object} [project={}] - Project record to inspect.
 * @returns {string} Absolute parent directory path.
 */
function getProjectLocation(project = {}) {
	return path.dirname(getProjectPath(project));
}

/**
 * Compares two paths using the repo's cross-platform normalization rules.
 *
 * @param {string} leftPath - First path to compare.
 * @param {string} rightPath - Second path to compare.
 * @returns {boolean} True when both paths refer to the same location.
 */
function pathsEqual(leftPath, rightPath) {
	return (
		normalizeComparablePath(leftPath) === normalizeComparablePath(rightPath)
	);
}

/**
 * Checks whether a candidate path stays within a root directory.
 *
 * @param {string} candidatePath - Path being validated.
 * @param {string} rootPath - Allowed root directory.
 * @returns {boolean} True when the candidate is the root or one of its descendants.
 */
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
