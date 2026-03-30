const fs = require('fs-extra');
const path = require('path');
const { loadProjects } = require('../utils/fileOperations');
const { findProject } = require('../utils/helpers');
const { getProjectPath } = require('../utils/projectPaths');

const HIDDEN_DIRECTORY_NAMES = new Set([
	'.dashboard',
	'.git',
	'.next',
	'node_modules',
]);
const MAX_TREE_ENTRIES = 1200;
const MAX_TEXT_FILE_BYTES = 1024 * 1024;

/**
 * Loads a project record and throws when it does not exist.
 *
 * @param {string} projectName - Project name to resolve.
 * @returns {object} Matching project record.
 */
function getProjectRecord(projectName) {
	const project = findProject(loadProjects(), projectName);
	if (!project) {
		throw new Error('Project not found');
	}

	return project;
}

/**
 * Resolves the project record together with its root workspace path.
 *
 * @param {string} projectName - Project name to resolve.
 * @returns {{project: object, rootPath: string}} Project record and absolute workspace root.
 */
function getProjectRoot(projectName) {
	const project = getProjectRecord(projectName);
	return {
		project,
		rootPath: getProjectPath(project),
	};
}

/**
 * Normalizes a project-relative path and rejects traversal outside the workspace.
 *
 * @param {string} [relativePath=''] - Relative file or directory path supplied by the client.
 * @returns {string} Safe normalized POSIX-style relative path.
 */
function normalizeRelativePath(relativePath = '') {
	if (typeof relativePath !== 'string') {
		throw new Error('Invalid file path');
	}

	const trimmed = relativePath.replace(/\\/g, '/').trim();
	if (!trimmed || trimmed === '.') {
		return '';
	}

	if (path.posix.isAbsolute(trimmed)) {
		throw new Error('Absolute paths are not allowed');
	}

	if (trimmed.includes('\0')) {
		throw new Error('Invalid file path');
	}

	const normalized = path.posix.normalize(trimmed);
	if (
		normalized === '..' ||
		normalized.startsWith('../') ||
		normalized.includes('/../')
	) {
		throw new Error('Path must stay inside the project');
	}

	return normalized
		.split('/')
		.filter((segment) => segment && segment !== '.')
		.join('/');
}

/**
 * Checks whether a resolved path stays inside the project root.
 *
 * @param {string} targetPath - Candidate absolute path.
 * @param {string} rootPath - Absolute project root path.
 * @returns {boolean} True when the target is the root or one of its descendants.
 */
function isWithinRoot(targetPath, rootPath) {
	const normalizedRoot = path.resolve(rootPath);
	const normalizedTarget = path.resolve(targetPath);
	const rootPrefix = `${normalizedRoot}${path.sep}`.toLowerCase();
	const normalizedTargetLower = normalizedTarget.toLowerCase();

	return (
		normalizedTargetLower === normalizedRoot.toLowerCase() ||
		normalizedTargetLower.startsWith(rootPrefix)
	);
}

/**
 * Resolves a project-relative path to both normalized and absolute representations.
 *
 * @param {string} projectName - Project name to resolve.
 * @param {string} [relativePath=''] - Relative file or directory path supplied by the client.
 * @returns {{project: object, rootPath: string, normalizedPath: string, resolvedPath: string}} Project metadata and path details.
 */
function resolveProjectPath(projectName, relativePath = '') {
	const { project, rootPath } = getProjectRoot(projectName);
	const normalizedPath = normalizeRelativePath(relativePath);
	const resolvedPath = normalizedPath
		? path.resolve(rootPath, normalizedPath)
		: rootPath;

	if (!isWithinRoot(resolvedPath, rootPath)) {
		throw new Error('Path must stay inside the project');
	}

	return {
		project,
		rootPath,
		normalizedPath,
		resolvedPath,
	};
}

/**
 * Hides internal directories that should not appear in the workspace browser.
 *
 * @param {string} entryName - Directory or file name.
 * @param {boolean} isDirectory - Whether the entry is a directory.
 * @returns {boolean} True when the entry should be hidden from the UI.
 */
function shouldHideEntry(entryName, isDirectory) {
	return isDirectory && HIDDEN_DIRECTORY_NAMES.has(entryName);
}

/**
 * Sorts directory entries so folders appear before files and names remain human-friendly.
 *
 * @param {{type: string, name: string}} left - Left entry to compare.
 * @param {{type: string, name: string}} right - Right entry to compare.
 * @returns {number} Sort comparator result.
 */
function compareEntries(left, right) {
	if (left.type !== right.type) {
		return left.type === 'directory' ? -1 : 1;
	}

	return left.name.localeCompare(right.name, undefined, {
		numeric: true,
		sensitivity: 'base',
	});
}

/**
 * Reads shared metadata for a file-system entry.
 *
 * @param {string} resolvedPath - Absolute path to the file or directory.
 * @param {string} normalizedPath - Project-relative path returned to the client.
 * @returns {Promise<{name: string, path: string, type: string, size: number | null, modifiedAt: string}>} Entry metadata.
 */
async function getEntryMetadata(resolvedPath, normalizedPath) {
	const stats = await fs.stat(resolvedPath);

	return {
		name: path.basename(resolvedPath),
		path: normalizedPath,
		type: stats.isDirectory() ? 'directory' : 'file',
		size: stats.isFile() ? stats.size : null,
		modifiedAt: stats.mtime.toISOString(),
	};
}

/**
 * Recursively builds the workspace tree shown in the editor.
 *
 * @param {string} rootPath - Absolute project root path.
 * @param {string} currentPath - Absolute directory currently being traversed.
 * @param {{count: number, truncated: boolean}} tracker - Mutable counters used to enforce tree limits.
 * @returns {Promise<Array<object>>} Nested file tree entries.
 */
async function buildDirectoryEntries(rootPath, currentPath, tracker) {
	if (tracker.count >= MAX_TREE_ENTRIES) {
		tracker.truncated = true;
		return [];
	}

	const entries = await fs.readdir(currentPath, { withFileTypes: true });
	const visibleEntries = entries
		.filter((entry) => !shouldHideEntry(entry.name, entry.isDirectory()))
		.sort((left, right) =>
			left.name.localeCompare(right.name, undefined, {
				numeric: true,
				sensitivity: 'base',
			}),
		);

	const nodes = [];

	for (const entry of visibleEntries) {
		if (tracker.count >= MAX_TREE_ENTRIES) {
			tracker.truncated = true;
			break;
		}

		const absoluteEntryPath = path.join(currentPath, entry.name);
		const relativeEntryPath = path
			.relative(rootPath, absoluteEntryPath)
			.split(path.sep)
			.join('/');
		const stats = await fs.stat(absoluteEntryPath);

		tracker.count += 1;

		if (entry.isDirectory()) {
			nodes.push({
				name: entry.name,
				path: relativeEntryPath,
				type: 'directory',
				modifiedAt: stats.mtime.toISOString(),
				children: await buildDirectoryEntries(
					rootPath,
					absoluteEntryPath,
					tracker,
				),
			});
			continue;
		}

		nodes.push({
			name: entry.name,
			path: relativeEntryPath,
			type: 'file',
			size: stats.size,
			modifiedAt: stats.mtime.toISOString(),
			extension: path.extname(entry.name).slice(1).toLowerCase(),
		});
	}

	return nodes.sort(compareEntries);
}

/**
 * Lists the project workspace tree for the editor sidebar.
 *
 * @param {string} projectName - Project name to inspect.
 * @returns {Promise<{projectName: string, rootPath: string, truncated: boolean, entryCount: number, entries: Array<object>}>} Workspace tree payload.
 */
async function listProjectFiles(projectName) {
	const { project, rootPath } = getProjectRoot(projectName);
	const tracker = {
		count: 0,
		truncated: false,
	};

	await fs.ensureDir(rootPath);
	const entries = await buildDirectoryEntries(rootPath, rootPath, tracker);

	return {
		projectName: project.name,
		rootPath,
		truncated: tracker.truncated,
		entryCount: tracker.count,
		entries,
	};
}

/**
 * Rejects binary files so the inline editor only opens text content.
 *
 * @param {Buffer} buffer - File contents read from disk.
 * @param {string} filePath - Project-relative file path used in error messages.
 * @returns {void}
 */
function assertTextFile(buffer, filePath) {
	if (buffer.includes(0)) {
		throw new Error(
			`"${filePath}" looks like a binary file and cannot be opened in the editor.`,
		);
	}
}

/**
 * Reads a text file from a project workspace.
 *
 * @param {string} projectName - Project whose file should be read.
 * @param {string} relativePath - Project-relative file path.
 * @returns {Promise<{name: string, path: string, size: number, modifiedAt: string, content: string}>} File metadata and UTF-8 content.
 */
async function readProjectFile(projectName, relativePath) {
	const { normalizedPath, resolvedPath } = resolveProjectPath(
		projectName,
		relativePath,
	);

	if (!normalizedPath) {
		throw new Error('Choose a file to open');
	}

	const stats = await fs.stat(resolvedPath);
	if (!stats.isFile()) {
		throw new Error('Only files can be opened in the editor');
	}

	if (stats.size > MAX_TEXT_FILE_BYTES) {
		throw new Error(
			'Files larger than 1 MB are not supported in the editor',
		);
	}

	const buffer = await fs.readFile(resolvedPath);
	assertTextFile(buffer, normalizedPath);

	return {
		name: path.basename(resolvedPath),
		path: normalizedPath,
		size: stats.size,
		modifiedAt: stats.mtime.toISOString(),
		content: buffer.toString('utf8'),
	};
}

/**
 * Writes UTF-8 content into a file inside a project workspace.
 *
 * @param {string} projectName - Project whose file should be updated.
 * @param {string} relativePath - Project-relative file path.
 * @param {string} content - New file contents to persist.
 * @returns {Promise<object>} Metadata for the saved file.
 */
async function saveProjectFile(projectName, relativePath, content) {
	const { rootPath, normalizedPath, resolvedPath } = resolveProjectPath(
		projectName,
		relativePath,
	);

	if (!normalizedPath) {
		throw new Error('A file path is required');
	}

	const payload = String(content ?? '');
	if (Buffer.byteLength(payload, 'utf8') > MAX_TEXT_FILE_BYTES) {
		throw new Error(
			'Files larger than 1 MB are not supported in the editor',
		);
	}

	if (payload.includes('\0')) {
		throw new Error('Invalid file content');
	}

	const parentDirectory = path.dirname(resolvedPath);
	if (!isWithinRoot(parentDirectory, rootPath)) {
		throw new Error('Path must stay inside the project');
	}

	await fs.ensureDir(parentDirectory);
	await fs.writeFile(resolvedPath, payload, 'utf8');

	return getEntryMetadata(resolvedPath, normalizedPath);
}

/**
 * Creates a new empty file or directory inside a project workspace.
 *
 * @param {string} projectName - Project whose workspace should be modified.
 * @param {string} relativePath - Project-relative path for the new entry.
 * @param {'file' | 'directory'} [entryType='file'] - Entry type to create.
 * @returns {Promise<object>} Metadata for the created entry.
 */
async function createProjectEntry(
	projectName,
	relativePath,
	entryType = 'file',
) {
	const { normalizedPath, resolvedPath } = resolveProjectPath(
		projectName,
		relativePath,
	);

	if (!normalizedPath) {
		throw new Error('A path is required');
	}

	if (await fs.pathExists(resolvedPath)) {
		throw new Error('That file or folder already exists');
	}

	if (entryType === 'directory') {
		await fs.ensureDir(resolvedPath);
		return getEntryMetadata(resolvedPath, normalizedPath);
	}

	if (entryType !== 'file') {
		throw new Error('Unsupported entry type');
	}

	await fs.ensureDir(path.dirname(resolvedPath));
	await fs.writeFile(resolvedPath, '', 'utf8');

	return getEntryMetadata(resolvedPath, normalizedPath);
}

/**
 * Deletes a file or directory inside a project workspace.
 *
 * @param {string} projectName - Project whose workspace should be modified.
 * @param {string} relativePath - Project-relative path to delete.
 * @returns {Promise<object>} Metadata describing the deleted entry.
 */
async function deleteProjectEntry(projectName, relativePath) {
	const { normalizedPath, resolvedPath, rootPath } = resolveProjectPath(
		projectName,
		relativePath,
	);

	if (!normalizedPath || resolvedPath === rootPath) {
		throw new Error('The project root cannot be deleted');
	}

	const metadata = await getEntryMetadata(resolvedPath, normalizedPath);
	await fs.remove(resolvedPath);

	return metadata;
}

module.exports = {
	listProjectFiles,
	readProjectFile,
	saveProjectFile,
	createProjectEntry,
	deleteProjectEntry,
	resolveProjectPath,
};
