const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const fsExtra = require('fs-extra');
const kill = require('tree-kill');
const { TERMINAL_HISTORY_FILE } = require('../config/constants');
const { loadProjects } = require('../utils/fileOperations');
const { findProject } = require('../utils/helpers');
const { resolveProjectPath } = require('./projectFileService');
const { getProjectCommandPresets } = require('./projectTemplates');
const { configureProcessToolEnvironment } = require('./developmentToolchain');
const { getTerminalSettings } = require('./settingsService');

configureProcessToolEnvironment();

const terminalExecutions = new Map();
const MAX_OUTPUT_LENGTH = 120000;
const MAX_HISTORY_ITEMS = 20;
const POWERSHELL_COMMAND =
	process.env.ComSpec &&
	process.env.ComSpec.toLowerCase().includes('powershell')
		? process.env.ComSpec
		: `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;

/**
 * Loads a project record and throws when the project does not exist.
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
 * Creates a structured error that callers can map to an HTTP status code.
 *
 * @param {string} message - User-facing error message.
 * @param {number} [statusCode=400] - Suggested HTTP status code.
 * @returns {Error} Error carrying a status code.
 */
function createStatusError(message, statusCode = 400) {
	const error = new Error(message);
	error.statusCode = statusCode;
	return error;
}

/**
 * Joins a preset's command steps into one shell command while preserving failure codes.
 *
 * @param {string[]} steps - Individual shell commands that belong to the preset.
 * @returns {string} Combined shell command string.
 */
function buildShellCommandFromSteps(steps) {
	if (!Array.isArray(steps) || steps.length === 0) {
		throw new Error('At least one command step is required');
	}

	if (process.platform === 'win32') {
		return steps
			.map(
				(step) =>
					`& { ${step}; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }`,
			)
			.join('; ');
	}

	return steps.join(' && ');
}

/**
 * Chooses the shell executable and arguments needed to run a command on the current OS.
 *
 * @param {string} command - Shell command string to execute.
 * @returns {{command: string, args: string[]}} Spawn settings for the selected shell.
 */
function getShellInvocation(command) {
	if (process.platform === 'win32') {
		return {
			command: POWERSHELL_COMMAND,
			args: [
				'-NoLogo',
				'-NoProfile',
				'-NonInteractive',
				'-ExecutionPolicy',
				'Bypass',
				'-Command',
				command,
			],
		};
	}

	return {
		command: process.env.SHELL || '/bin/bash',
		args: ['-lc', command],
	};
}

/**
 * Rejects ad-hoc terminal commands unless the dashboard is explicitly in advanced terminal mode.
 *
 * @param {{allowManualCommands?: boolean}} [terminalSettings=getTerminalSettings()] - Terminal settings payload.
 * @returns {void}
 */
function assertManualCommandsAllowed(terminalSettings = getTerminalSettings()) {
	if (terminalSettings.allowManualCommands) {
		return;
	}

	throw createStatusError(
		'Manual terminal commands are disabled. Enable Advanced terminal mode in Settings to run ad-hoc commands.',
		403,
	);
}

/**
 * Limits stored terminal output so long-running commands do not grow unbounded in memory.
 *
 * @param {string} output - Current buffered terminal output.
 * @returns {{output: string, truncated: boolean}} Possibly truncated output and a flag describing whether truncation occurred.
 */
function trimOutput(output) {
	if (output.length <= MAX_OUTPUT_LENGTH) {
		return {
			output,
			truncated: false,
		};
	}

	return {
		output: output.slice(output.length - MAX_OUTPUT_LENGTH),
		truncated: true,
	};
}

/**
 * Loads the persisted terminal history store from disk.
 *
 * @returns {Record<string, Array<object>>} History entries grouped by project name.
 */
function loadTerminalHistoryStore() {
	if (!fsExtra.existsSync(TERMINAL_HISTORY_FILE)) {
		return {};
	}

	try {
		return fsExtra.readJsonSync(TERMINAL_HISTORY_FILE);
	} catch (error) {
		return {};
	}
}

/**
 * Persists the grouped terminal history store to disk.
 *
 * @param {Record<string, Array<object>>} store - History entries grouped by project name.
 * @returns {void}
 */
function saveTerminalHistoryStore(store) {
	fsExtra.ensureDirSync(path.dirname(TERMINAL_HISTORY_FILE));
	fsExtra.writeJsonSync(TERMINAL_HISTORY_FILE, store, { spaces: 2 });
}

/**
 * Converts an execution record into a lightweight history entry that can be persisted.
 *
 * @param {object} execution - Internal execution record.
 * @returns {object} Serializable history entry.
 */
function toHistoryEntry(execution) {
	return {
		id: execution.id,
		projectName: execution.projectName,
		kind: execution.kind,
		label: execution.label,
		command: execution.command,
		cwd: execution.cwd,
		status: execution.status,
		startedAt: execution.startedAt,
		updatedAt: execution.updatedAt,
		endedAt: execution.endedAt,
		exitCode: execution.exitCode,
	};
}

/**
 * Writes the latest snapshot of an execution into the persistent history store.
 *
 * @param {object} execution - Internal execution record.
 * @returns {void}
 */
function persistExecutionHistory(execution) {
	const store = loadTerminalHistoryStore();
	const historyItems = Array.isArray(store[execution.projectName])
		? store[execution.projectName]
		: [];
	const nextEntry = toHistoryEntry(execution);
	const existingIndex = historyItems.findIndex(
		(entry) => entry.id === execution.id,
	);

	if (existingIndex >= 0) {
		historyItems[existingIndex] = nextEntry;
	} else {
		historyItems.unshift(nextEntry);
	}

	store[execution.projectName] = historyItems
		.sort((left, right) => {
			const leftTime = Date.parse(left.startedAt || '') || 0;
			const rightTime = Date.parse(right.startedAt || '') || 0;
			return rightTime - leftTime;
		})
		.slice(0, MAX_HISTORY_ITEMS);
	saveTerminalHistoryStore(store);
}

/**
 * Appends stdout or stderr text to the in-memory execution record.
 *
 * @param {object} execution - Mutable execution record stored in `terminalExecutions`.
 * @param {Buffer} chunk - Output chunk emitted by the child process.
 * @param {'stdout' | 'stderr'} stream - Stream that produced the chunk.
 * @returns {void}
 */
function appendOutput(execution, chunk, stream) {
	const prefix = stream === 'stderr' ? '[stderr] ' : '';
	const nextValue = `${execution.output}${prefix}${chunk.toString()}`;
	const trimmed = trimOutput(nextValue);
	execution.output = trimmed.output;
	execution.truncated = execution.truncated || trimmed.truncated;
	execution.updatedAt = new Date().toISOString();
}

/**
 * Converts an internal execution record to the public API shape returned to the client.
 *
 * @param {object} execution - Internal mutable execution record.
 * @returns {object} Serializable execution snapshot.
 */
function toExecutionSnapshot(execution) {
	return {
		id: execution.id,
		projectName: execution.projectName,
		kind: execution.kind,
		label: execution.label,
		command: execution.command,
		cwd: execution.cwd,
		status: execution.status,
		startedAt: execution.startedAt,
		updatedAt: execution.updatedAt,
		endedAt: execution.endedAt,
		exitCode: execution.exitCode,
		output: execution.output,
		truncated: execution.truncated,
		pid: execution.pid,
	};
}

/**
 * Starts a tracked shell execution inside a project workspace.
 *
 * @param {string} projectName - Project whose workspace should be used.
 * @param {{command: string, cwd?: string, label?: string}} options - Terminal execution details.
 * @param {string} options.command - Command string to execute.
 * @param {string} [options.cwd=''] - Optional project-relative working directory.
 * @param {string} [options.label='Custom command'] - Friendly label shown in the UI.
 * @returns {object} Initial execution snapshot.
 */
function startExecution(
	projectName,
	{ command, cwd = '', kind = 'manual', label = 'Custom command' },
) {
	const trimmedCommand = String(command || '').trim();
	if (!trimmedCommand) {
		throw new Error('A terminal command is required');
	}

	const { normalizedPath, resolvedPath } = resolveProjectPath(
		projectName,
		cwd,
	);
	if (!fs.existsSync(resolvedPath)) {
		throw new Error('The selected working directory does not exist');
	}

	const shellInvocation = getShellInvocation(trimmedCommand);
	const execution = {
		id: randomUUID(),
		projectName,
		kind,
		label,
		command: trimmedCommand,
		cwd: normalizedPath,
		status: 'running',
		startedAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		endedAt: null,
		exitCode: null,
		output: '',
		truncated: false,
		pid: null,
		stopRequested: false,
		proc: null,
	};

	const proc = spawn(shellInvocation.command, shellInvocation.args, {
		cwd: resolvedPath,
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true,
		env: process.env,
	});

	execution.proc = proc;
	execution.pid = proc.pid || null;
	terminalExecutions.set(execution.id, execution);
	persistExecutionHistory(execution);

	if (proc.stdout) {
		proc.stdout.on('data', (chunk) =>
			appendOutput(execution, chunk, 'stdout'),
		);
	}

	if (proc.stderr) {
		proc.stderr.on('data', (chunk) =>
			appendOutput(execution, chunk, 'stderr'),
		);
	}

	proc.on('error', (error) => {
		appendOutput(execution, Buffer.from(`${error.message}\n`), 'stderr');
		execution.status = execution.stopRequested ? 'stopped' : 'failed';
		execution.exitCode = null;
		execution.endedAt = new Date().toISOString();
		execution.updatedAt = execution.endedAt;
		persistExecutionHistory(execution);
	});

	proc.on('close', (code) => {
		execution.exitCode = Number.isInteger(code) ? code : null;
		execution.endedAt = new Date().toISOString();
		execution.updatedAt = execution.endedAt;
		execution.status = execution.stopRequested
			? 'stopped'
			: code === 0
				? 'completed'
				: 'failed';
		execution.proc = null;
		execution.pid = null;
		persistExecutionHistory(execution);
	});

	return toExecutionSnapshot(execution);
}

/**
 * Runs an ad-hoc command entered by the user for a specific project.
 *
 * @param {string} projectName - Project whose workspace should be used.
 * @param {string} command - Command string entered by the user.
 * @param {{cwd?: string, label?: string}} [options={}] - Optional execution metadata.
 * @returns {object} Initial execution snapshot.
 */
function runProjectCommand(projectName, command, options = {}) {
	const project = getProjectRecord(projectName);
	assertManualCommandsAllowed();
	return startExecution(project.name, {
		command,
		cwd: options.cwd || '',
		kind: 'manual',
		label: options.label || 'Custom command',
	});
}

/**
 * Runs a predefined command preset for a project.
 *
 * @param {string} projectName - Project whose preset should be executed.
 * @param {string} presetId - Preset id from `getProjectCommandPresets`.
 * @returns {object} Initial execution snapshot.
 */
function runProjectPreset(projectName, presetId) {
	const project = getProjectRecord(projectName);
	const preset = getProjectCommandPresets(project).find(
		(entry) => entry.id === presetId,
	);

	if (!preset) {
		throw new Error('Command preset not found');
	}

	return startExecution(project.name, {
		command: buildShellCommandFromSteps(preset.steps),
		cwd: preset.cwd || '',
		kind: 'preset',
		label: preset.label,
	});
}

/**
 * Returns recent terminal executions for a project.
 *
 * @param {string} projectName - Project that owns the history.
 * @param {{limit?: number}} [options={}] - Optional limit for recent entries.
 * @returns {Array<object>} Recent execution history, newest first.
 */
function getProjectCommandHistory(projectName, options = {}) {
	const project = getProjectRecord(projectName);

	const store = loadTerminalHistoryStore();
	const historyItems = Array.isArray(store[project.name])
		? store[project.name]
		: [];
	const requestedLimit = Number.parseInt(options.limit, 10);
	const safeLimit =
		Number.isInteger(requestedLimit) && requestedLimit > 0
			? Math.min(requestedLimit, MAX_HISTORY_ITEMS)
			: MAX_HISTORY_ITEMS;

	return historyItems.slice(0, safeLimit);
}

/**
 * Returns the latest snapshot for a tracked terminal execution.
 *
 * @param {string} projectName - Project that owns the execution.
 * @param {string} executionId - Execution id returned by `runProjectCommand` or `runProjectPreset`.
 * @returns {object} Current execution snapshot.
 */
function getProjectExecution(projectName, executionId) {
	const project = getProjectRecord(projectName);

	const execution = terminalExecutions.get(executionId);
	if (!execution || execution.projectName !== project.name) {
		throw new Error('Terminal execution not found');
	}

	return toExecutionSnapshot(execution);
}

/**
 * Requests termination for a tracked terminal execution.
 *
 * @param {string} projectName - Project that owns the execution.
 * @param {string} executionId - Execution id returned by `runProjectCommand` or `runProjectPreset`.
 * @returns {Promise<object>} Final or in-progress execution snapshot after the stop signal is sent.
 */
function stopProjectExecution(projectName, executionId) {
	const project = getProjectRecord(projectName);

	const execution = terminalExecutions.get(executionId);
	if (!execution || execution.projectName !== project.name) {
		throw new Error('Terminal execution not found');
	}

	if (!execution.proc?.pid) {
		return toExecutionSnapshot(execution);
	}

	execution.stopRequested = true;

	return new Promise((resolve) => {
		kill(execution.proc.pid, 'SIGTERM', () => {
			resolve(toExecutionSnapshot(execution));
		});
	});
}

module.exports = {
	runProjectCommand,
	runProjectPreset,
	getProjectExecution,
	getProjectCommandHistory,
	stopProjectExecution,
	__test__: {
		assertManualCommandsAllowed,
		buildShellCommandFromSteps,
		MAX_HISTORY_ITEMS,
		MAX_OUTPUT_LENGTH,
		toHistoryEntry,
		trimOutput,
	},
};
