const fs = require('fs');
const path = require('path');
const { PROJECTS_DIR } = require('../config/constants');
const { loadProjects } = require('../utils/fileOperations');
const { findProject } = require('../utils/helpers');

const PROJECT_LOG_FOLDER = '.dashboard';
const PROJECT_RUNTIME_LOG_FOLDER = 'runtime-logs';
const SUPPORTED_PROJECT_SERVICES = ['frontend', 'backend'];
const DEFAULT_LINE_LIMIT = 220;
const MAX_TAIL_BYTES = 96 * 1024;
const ANSI_PATTERN = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function assertServiceName(serviceName) {
	if (!SUPPORTED_PROJECT_SERVICES.includes(serviceName)) {
		throw new Error(`Unsupported project service: ${serviceName}`);
	}
}

function getProjectLogDirectory(projectName) {
	return path.join(
		PROJECTS_DIR,
		projectName,
		PROJECT_LOG_FOLDER,
		PROJECT_RUNTIME_LOG_FOLDER,
	);
}

function getProjectServiceLogPath(projectName, serviceName) {
	assertServiceName(serviceName);
	return path.join(getProjectLogDirectory(projectName), `${serviceName}.log`);
}

function ensureRuntimeLogDirectory(projectName) {
	const logDirectory = getProjectLogDirectory(projectName);
	fs.mkdirSync(logDirectory, { recursive: true });
	return logDirectory;
}

function sanitizeLogText(value) {
	return String(value ?? '')
		.replace(/\u0000/g, '')
		.replace(ANSI_PATTERN, '')
		.replace(/âžœ|➜/g, '->')
		.replace(/\r/g, '');
}

function formatLogLine(label, message) {
	return `${new Date().toISOString()} [${label}] ${message}\n`;
}

function appendFormattedLines(stream, label, lines) {
	for (const rawLine of lines) {
		const message = sanitizeLogText(rawLine);
		if (!message.trim()) {
			continue;
		}

		stream.write(formatLogLine(label, message));
	}
}

function appendRuntimeLogEvent(
	projectName,
	serviceName,
	message,
	label = 'system',
) {
	const logPath = getProjectServiceLogPath(projectName, serviceName);
	ensureRuntimeLogDirectory(projectName);

	const lines = sanitizeLogText(message).split('\n').filter(Boolean);
	if (lines.length === 0) {
		return logPath;
	}

	const payload = lines.map((line) => formatLogLine(label, line)).join('');
	fs.appendFileSync(logPath, payload, 'utf8');
	return logPath;
}

function createRuntimeLogSession(projectName, serviceName, context = {}) {
	const logPath = getProjectServiceLogPath(projectName, serviceName);
	ensureRuntimeLogDirectory(projectName);

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

function ensureProjectExists(projectName) {
	const projects = loadProjects();
	const project = findProject(projects, projectName);

	if (!project) {
		throw new Error('Project not found');
	}

	return project;
}

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

async function readServiceRuntimeLog(projectName, serviceName, lineLimit) {
	const logPath = getProjectServiceLogPath(projectName, serviceName);

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
