const fs = require('fs');
const path = require('path');
const { loadProjects } = require('../utils/fileOperations');
const { findProject } = require('../utils/helpers');
const { getProjectPath } = require('../utils/projectPaths');

const PROJECT_LOG_FOLDER = '.dashboard';
const PROJECT_RUNTIME_LOG_FOLDER = 'runtime-logs';
const SUPPORTED_PROJECT_SERVICES = ['frontend', 'backend'];
const DEFAULT_LINE_LIMIT = 220;
const MAX_TAIL_BYTES = 96 * 1024;
const ANSI_PATTERN = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

/**
 * Validates that a runtime log request only targets supported managed services.
 *
 * @param {string} serviceName - Service identifier supplied by the caller.
 * @returns {void}
 */
function assertServiceName(serviceName) {
	if (!SUPPORTED_PROJECT_SERVICES.includes(serviceName)) {
		throw new Error(`Unsupported project service: ${serviceName}`);
	}
}

/**
 * Resolves the runtime log folder for a project.
 *
 * @param {object} project - Persisted project record.
 * @returns {string} Absolute path to the runtime log directory.
 */
function getProjectLogDirectory(project) {
	return path.join(
		getProjectPath(project),
		PROJECT_LOG_FOLDER,
		PROJECT_RUNTIME_LOG_FOLDER,
	);
}

/**
 * Resolves the runtime log file path for a project service.
 *
 * @param {object} project - Persisted project record.
 * @param {'frontend' | 'backend'} serviceName - Managed service name.
 * @returns {string} Absolute path to the service log file.
 */
function getProjectServiceLogPath(project, serviceName) {
	assertServiceName(serviceName);
	return path.join(getProjectLogDirectory(project), `${serviceName}.log`);
}

/**
 * Ensures the runtime log directory exists for a project.
 *
 * @param {object} project - Persisted project record.
 * @returns {string} Absolute path to the runtime log directory.
 */
function ensureRuntimeLogDirectory(project) {
	const logDirectory = getProjectLogDirectory(project);
	fs.mkdirSync(logDirectory, { recursive: true });
	return logDirectory;
}

/**
 * Removes terminal control characters and null bytes from log text.
 *
 * @param {unknown} value - Raw log text or chunk.
 * @returns {string} Sanitized log text safe to persist and display.
 */
function sanitizeLogText(value) {
	return String(value ?? '')
		.replace(/\u0000/g, '')
		.replace(ANSI_PATTERN, '')
		.replace(/âžœ|➜/g, '->')
		.replace(/\r/g, '');
}

/**
 * Formats a single log line using the dashboard's timestamped structure.
 *
 * @param {string} label - Log source label such as `stdout`, `stderr`, or `system`.
 * @param {string} message - Message content to append.
 * @returns {string} Formatted log line including a trailing newline.
 */
function formatLogLine(label, message) {
	return `${new Date().toISOString()} [${label}] ${message}\n`;
}

/**
 * Writes multiple sanitized log lines to an open stream.
 *
 * @param {fs.WriteStream} stream - Writable stream for the log file.
 * @param {string} label - Log source label such as `stdout`, `stderr`, or `system`.
 * @param {string[]} lines - Raw lines to append.
 * @returns {void}
 */
function appendFormattedLines(stream, label, lines) {
	for (const rawLine of lines) {
		const message = sanitizeLogText(rawLine);
		if (!message.trim()) {
			continue;
		}

		stream.write(formatLogLine(label, message));
	}
}

/**
 * Appends a one-off runtime log event directly to a service log file.
 *
 * @param {string} projectName - Project whose log file should be updated.
 * @param {'frontend' | 'backend'} serviceName - Managed service name.
 * @param {string} message - Log text to append.
 * @param {string} [label='system'] - Log source label written into each line.
 * @returns {string} Absolute path to the log file that was written.
 */
function appendRuntimeLogEvent(
	projectName,
	serviceName,
	message,
	label = 'system',
) {
	const project = ensureProjectExists(projectName);
	const logPath = getProjectServiceLogPath(project, serviceName);
	ensureRuntimeLogDirectory(project);

	const lines = sanitizeLogText(message).split('\n').filter(Boolean);
	if (lines.length === 0) {
		return logPath;
	}

	const payload = lines.map((line) => formatLogLine(label, line)).join('');
	fs.appendFileSync(logPath, payload, 'utf8');
	return logPath;
}

/**
 * Creates a streaming log session used while a managed service starts and runs.
 *
 * @param {string} projectName - Project whose runtime logs should be updated.
 * @param {'frontend' | 'backend'} serviceName - Managed service name.
 * @param {{port?: number, cwd?: string, command?: string, args?: string[]}} [context={}] - Context shown at the top of the log file.
 * @returns {{logPath: string, writeOutput: (bufferKey: 'stdout' | 'stderr', chunk: Buffer) => void, writeEvent: (message: string, label?: string) => void, close: (finalMessage?: string) => void}} Runtime log session helpers.
 */
function createRuntimeLogSession(projectName, serviceName, context = {}) {
	const project = ensureProjectExists(projectName);
	const logPath = getProjectServiceLogPath(project, serviceName);
	ensureRuntimeLogDirectory(project);

	const stream = fs.createWriteStream(logPath, {
		flags: 'a',
		encoding: 'utf8',
	});
	const buffers = {
		stdout: '',
		stderr: '',
	};
	let closed = false;

	const writeEvent = (message, label = 'system') => {
		appendFormattedLines(
			stream,
			label,
			sanitizeLogText(message).split('\n'),
		);
	};

	const flushBuffer = (bufferKey) => {
		const bufferedValue = buffers[bufferKey];
		if (!bufferedValue) {
			return;
		}

		appendFormattedLines(stream, bufferKey, [bufferedValue]);
		buffers[bufferKey] = '';
	};

	writeEvent('------------------------------------------------------------');
	writeEvent(`Starting ${serviceName} service for project "${projectName}".`);

	if (context.port) {
		writeEvent(`Expected port: ${context.port}`);
	}

	if (context.cwd) {
		writeEvent(`Working directory: ${context.cwd}`);
	}

	if (context.command) {
		const commandPreview = [context.command, ...(context.args || [])].join(
			' ',
		);
		writeEvent(`Command: ${commandPreview}`);
	}

	return {
		logPath,
		writeOutput(bufferKey, chunk) {
			const nextBuffer =
				(buffers[bufferKey] || '') + sanitizeLogText(chunk.toString());
			const lines = nextBuffer.split('\n');
			buffers[bufferKey] = lines.pop() ?? '';
			appendFormattedLines(stream, bufferKey, lines);
		},
		writeEvent,
		close(finalMessage = '') {
			if (closed) {
				return;
			}

			closed = true;
			flushBuffer('stdout');
			flushBuffer('stderr');

			if (finalMessage) {
				writeEvent(finalMessage);
			}

			writeEvent(
				'------------------------------------------------------------',
			);
			stream.end();
		},
	};
}

/**
 * Confirms that a project exists before reading or writing its runtime logs.
 *
 * @param {string} projectName - Project name to resolve.
 * @returns {object} Matching project record.
 */
function ensureProjectExists(projectName) {
	const projects = loadProjects();
	const project = findProject(projects, projectName);

	if (!project) {
		throw new Error('Project not found');
	}

	return project;
}

/**
 * Reads the tail end of a file without loading the whole file into memory.
 *
 * @param {string} filePath - Absolute file path to read.
 * @param {number} [maxBytes=MAX_TAIL_BYTES] - Maximum number of bytes to keep from the end of the file.
 * @returns {Promise<{content: string, truncated: boolean, size: number, updatedAt: string}>} Tail content plus file metadata.
 */
async function readTailText(filePath, maxBytes = MAX_TAIL_BYTES) {
	const stats = await fs.promises.stat(filePath);
	const start = Math.max(0, stats.size - maxBytes);
	const length = stats.size - start;
	const handle = await fs.promises.open(filePath, 'r');

	try {
		const buffer = Buffer.alloc(length);
		await handle.read(buffer, 0, length, start);

		let content = buffer.toString('utf8');
		if (start > 0) {
			const firstNewlineIndex = content.indexOf('\n');
			if (firstNewlineIndex >= 0) {
				content = content.slice(firstNewlineIndex + 1);
			}
		}

		return {
			content,
			truncated: start > 0,
			size: stats.size,
			updatedAt: stats.mtime.toISOString(),
		};
	} finally {
		await handle.close();
	}
}

/**
 * Reads the runtime log for a single project service.
 *
 * @param {string} projectName - Project whose service log should be read.
 * @param {'frontend' | 'backend'} serviceName - Managed service name.
 * @param {number} lineLimit - Number of recent log lines to keep.
 * @returns {Promise<object>} Service log payload for the API.
 */
async function readServiceRuntimeLog(projectName, serviceName, lineLimit) {
	const project = ensureProjectExists(projectName);
	const logPath = getProjectServiceLogPath(project, serviceName);

	try {
		const { content, truncated, size, updatedAt } =
			await readTailText(logPath);
		const lines = sanitizeLogText(content)
			.split('\n')
			.map((entry) => entry.trimEnd())
			.filter(Boolean);
		const limitedLines = lines.slice(-lineLimit);

		return {
			service: serviceName,
			available: limitedLines.length > 0,
			logPath,
			updatedAt,
			size,
			truncated,
			lineCount: limitedLines.length,
			content: limitedLines.join('\n'),
		};
	} catch (error) {
		if (error.code === 'ENOENT') {
			return {
				service: serviceName,
				available: false,
				logPath,
				updatedAt: null,
				size: 0,
				truncated: false,
				lineCount: 0,
				content: '',
			};
		}

		throw error;
	}
}

/**
 * Reads runtime logs for one project, optionally filtered to a single service.
 *
 * @param {string} projectName - Project whose runtime logs should be read.
 * @param {{serviceName?: string | null, lineLimit?: number}} [options={}] - Optional service filter and line limit.
 * @returns {Promise<{projectName: string, fetchedAt: string, services: {frontend: object | null, backend: object | null}}>} Runtime log payload grouped by service.
 */
async function readProjectRuntimeLogs(
	projectName,
	{ serviceName = null, lineLimit = DEFAULT_LINE_LIMIT } = {},
) {
	const project = ensureProjectExists(projectName);
	const normalizedLineLimit = Number.isFinite(Number(lineLimit))
		? Math.max(40, Math.min(500, Number(lineLimit)))
		: DEFAULT_LINE_LIMIT;
	const selectedService = serviceName || null;

	if (selectedService) {
		assertServiceName(selectedService);
	}

	const services = {
		frontend: null,
		backend: null,
	};

	for (const currentService of SUPPORTED_PROJECT_SERVICES) {
		if (!project[currentService]) {
			continue;
		}

		if (selectedService && selectedService !== currentService) {
			continue;
		}

		services[currentService] = await readServiceRuntimeLog(
			project.name,
			currentService,
			normalizedLineLimit,
		);
	}

	return {
		projectName: project.name,
		fetchedAt: new Date().toISOString(),
		services,
	};
}

module.exports = {
	appendRuntimeLogEvent,
	createRuntimeLogSession,
	readProjectRuntimeLogs,
	getProjectServiceLogPath,
};
