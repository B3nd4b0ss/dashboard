const fs = require('fs');
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
 * Spawns npm using the most reliable launcher for the current platform.
 *
 * @param {string[]} args - npm arguments without the base executable.
 * @param {object} [options={}] - Additional spawn options.
 * @returns {import('child_process').ChildProcess} Spawned npm process.
 */
function spawnNpm(args, options = {}) {
	const spawnOptions = {
		shell: false,
		windowsHide: true,
		...options,
	};

	if (process.platform === 'win32') {
		const invocation = [
			quoteForCmd(NPM_COMMAND),
			...args.map(quoteForCmd),
		].join(' ');

		return spawn(
			COMMAND_SHELL,
			['/d', '/s', '/c', `"${invocation}"`],
			spawnOptions,
		);
	}

	return spawn(NPM_COMMAND, args, spawnOptions);
}

module.exports = {
	spawnNpm,
};
