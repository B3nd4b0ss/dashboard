const path = require('path');
const { spawn } = require('child_process');
const { spawnNpm } = require('./dashboard-dev-utils');

const rootDir = path.resolve(__dirname, '..');
const ANSI_PATTERN = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function killChildTree(childProcess) {
	if (
		!childProcess ||
		childProcess.exitCode !== null ||
		childProcess.pid == null
	) {
		return;
	}

	if (process.platform === 'win32') {
		const killer = spawn(
			'taskkill',
			['/PID', String(childProcess.pid), '/T', '/F'],
			{
				stdio: 'ignore',
				windowsHide: true,
			},
		);

		killer.on('error', (error) => {
			console.error(
				'[dashboard-main] Failed to stop child tree:',
				error.message,
			);
		});

		return;
	}

	childProcess.kill('SIGTERM');
}

function sanitizeConsoleText(value) {
	return String(value ?? '')
		.replace(/\u0000/g, '')
		.replace(ANSI_PATTERN, '')
		.replace(/âžœ|➜/g, '->')
		.replace(/\r/g, '');
}

function forwardStream(stream, target) {
	if (!stream) {
		return;
	}

	stream.on('data', (chunk) => {
		const sanitizedChunk = sanitizeConsoleText(chunk.toString('utf8'));
		if (!sanitizedChunk) {
			return;
		}

		target.write(sanitizedChunk);
	});
}

const childProcess = spawnNpm(['run', 'dev'], {
	cwd: rootDir,
	stdio: ['ignore', 'pipe', 'pipe'],
	env: {
		...process.env,
		FORCE_COLOR: '0',
		NO_COLOR: '1',
		CLICOLOR: '0',
		CLICOLOR_FORCE: '0',
		npm_config_color: 'false',
	},
});

forwardStream(childProcess.stdout, process.stdout);
forwardStream(childProcess.stderr, process.stderr);

childProcess.on('error', (error) => {
	console.error(
		'[dashboard-main] Failed to launch root dev script:',
		error.message,
	);
	process.exit(1);
});

childProcess.on('exit', (code, signal) => {
	if (signal) {
		process.exit(1);
		return;
	}

	process.exit(code ?? 0);
});

['SIGINT', 'SIGTERM', 'SIGBREAK'].forEach((signal) => {
	process.on(signal, () => {
		killChildTree(childProcess);
	});
});
