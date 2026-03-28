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

function getProjectRecord(projectName) {
	const project = findProject(loadProjects(), projectName);
	if (!project) {
		throw new Error('Project not found');
	}

	return project;
}

function getProjectRoot(projectName) {
	const project = getProjectRecord(projectName);
	return {
		project,
		rootPath: getProjectPath(project),
	};
}

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

function shouldHideEntry(entryName, isDirectory) {
	return isDirectory && HIDDEN_DIRECTORY_NAMES.has(entryName);
}

function compareEntries(left, right) {
	if (left.type !== right.type) {
		return left.type === 'directory' ? -1 : 1;
	}

	return left.name.localeCompare(right.name, undefined, {
		numeric: true,
		sensitivity: 'base',
	});
}

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

function assertTextFile(buffer, filePath) {
	if (buffer.includes(0)) {
		throw new Error(
			`"${filePath}" looks like a binary file and cannot be opened in the editor.`,
		);
	}
}

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
		throw new Error('Files larger than 1 MB are not supported in the editor');
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
		throw new Error('Files larger than 1 MB are not supported in the editor');
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

async function createProjectEntry(projectName, relativePath, entryType = 'file') {
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
