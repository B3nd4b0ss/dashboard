const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Resolves the best npm launcher available on the current machine.
 *
 * @returns {string} Absolute path or executable name used for npm commands.
 */
function resolveNpmCommand() {
	if (process.platform !== 'win32') {
		return 'npm';
	}

	const candidateDirectories = [
		process.env.NVM_SYMLINK,
		process.env.NVM_HOME,
		...(process.env.PATH || '').split(path.delimiter),
	]
		.map((entry) => entry && entry.trim())
		.filter(Boolean);

	const seenDirectories = new Set();
	for (const directory of candidateDirectories) {
		const normalizedDirectory = directory.toLowerCase();
		if (seenDirectories.has(normalizedDirectory)) {
			continue;
		}

		seenDirectories.add(normalizedDirectory);

		const candidate = path.join(directory, 'npm.cmd');
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return 'npm.cmd';
}

const NPM_COMMAND = resolveNpmCommand();
const COMMAND_SHELL = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
const WINDOWS_NPM_CLI =
	process.platform === 'win32' && path.isAbsolute(NPM_COMMAND)
		? path.join(
				path.dirname(NPM_COMMAND),
				'node_modules',
				'npm',
				'bin',
				'npm-cli.js',
			)
		: null;

/**
 * Escapes a value for safe embedding inside a Windows `cmd.exe` command line.
 *
 * @param {unknown} value - Raw argument value to escape.
 * @returns {string} Escaped command-line token.
 */
function quoteForCmd(value) {
	const stringValue = String(value);
	if (!/[\s"&^<>|()]/.test(stringValue)) {
		return stringValue;
	}

	return `"${stringValue.replace(/"/g, '""')}"`;
}

/**
 * Spawns a child process without opening a visible Windows console window.
 *
 * @param {string} command - Executable to run.
 * @param {string[]} args - Arguments passed to the executable.
 * @param {object} [options={}] - Additional spawn options.
 * @returns {import('child_process').ChildProcess} Spawned child process.
 */
function spawnHidden(command, args, options = {}) {
	return spawn(command, args, {
		shell: false,
		windowsHide: true,
		...options,
	});
}

/**
 * Spawns npm using the most reliable launcher for the current platform.
 *
 * @param {string[]} args - npm arguments without the base executable.
 * @param {object} [options={}] - Additional spawn options.
 * @returns {import('child_process').ChildProcess} Spawned npm process.
 */
function spawnNpm(args, options = {}) {
	if (process.platform === 'win32' && WINDOWS_NPM_CLI) {
		return spawnHidden(
			process.execPath,
			[WINDOWS_NPM_CLI, ...args],
			options,
		);
	}

	if (process.platform === 'win32') {
		const invocation = [
			quoteForCmd(NPM_COMMAND),
			...args.map(quoteForCmd),
		].join(' ');
		return spawnHidden(
			COMMAND_SHELL,
			['/d', '/s', '/c', `"${invocation}"`],
			options,
		);
	}

	return spawnHidden(NPM_COMMAND, args, options);
}

/**
 * Runs `npm install` inside a generated project folder.
 *
 * @param {string} targetPath - Absolute workspace path where dependencies should be installed.
 * @param {import('events').EventEmitter | null} [eventEmitter=null] - Optional streaming emitter used by the SSE workflow.
 * @returns {Promise<void>}
 */
async function installProjectDependencies(targetPath, eventEmitter = null) {
	await new Promise((resolve, reject) => {
		const installProc = spawnNpm(['install'], {
			cwd: targetPath,
			stdio: eventEmitter ? ['ignore', 'pipe', 'pipe'] : 'inherit',
		});

		if (eventEmitter) {
			installProc.stdout.on('data', (data) => {
				const output = data.toString().trim();
				if (
					output &&
					!output.includes('npm notice') &&
					!output.includes('npm WARN')
				) {
					eventEmitter.emit('log', `  ${output}`);
				}
			});
			installProc.stderr.on('data', (data) => {
				const output = data.toString().trim();
				if (output && !output.includes('npm WARN')) {
					eventEmitter.emit('log', `  warning: ${output}`);
				}
			});
		}

		installProc.on('close', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`npm install failed with code ${code}`));
		});
		installProc.on('error', reject);
	});
}

/**
 * Creates a Vite starter project inside an existing frontend workspace folder.
 *
 * @param {string} frontendPath - Absolute frontend workspace path.
 * @param {string} viteTemplate - Vite template id such as `react` or `vanilla-ts`.
 * @param {import('events').EventEmitter | null} [eventEmitter=null] - Optional streaming emitter used by the SSE workflow.
 * @returns {Promise<void>}
 */
async function createViteProject(
	frontendPath,
	viteTemplate,
	eventEmitter = null,
) {
	await new Promise((resolve, reject) => {
		const proc = spawnNpm(
			['create', 'vite@latest', '.', '--', '--template', viteTemplate],
			{
				cwd: frontendPath,
				stdio: eventEmitter ? ['ignore', 'pipe', 'pipe'] : 'inherit',
			},
		);

		if (eventEmitter) {
			proc.stdout.on('data', (data) => {
				const output = data.toString().trim();
				if (output) {
					eventEmitter.emit('log', `  ${output}`);
				}
			});
			proc.stderr.on('data', (data) => {
				const output = data.toString().trim();
				if (output) {
					eventEmitter.emit('log', `  warning: ${output}`);
				}
			});
		}

		proc.on('close', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`Vite creation failed with code ${code}`));
		});
		proc.on('error', reject);
	});
}

module.exports = {
	createViteProject,
	installProjectDependencies,
	spawnNpm,
};
