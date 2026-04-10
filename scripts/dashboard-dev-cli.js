#!/usr/bin/env node

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { spawnNpm } = require('./dashboard-dev-utils');

const rootDir = path.resolve(__dirname, '..');
const logsDir = path.join(rootDir, 'logs');
const stateFile = path.join(logsDir, 'dashboard-processes.json');
const dashboardConfigFile = path.join(rootDir, 'dashboard.config.json');

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureLogsDirectory() {
	fs.mkdirSync(logsDir, { recursive: true });
}

function readDashboardConfig() {
	return JSON.parse(fs.readFileSync(dashboardConfigFile, 'utf8'));
}

function getDashboardPorts() {
	const dashboardConfig = readDashboardConfig();
	return {
		backend: Number(dashboardConfig?.ports?.backend) || 4000,
		frontend: Number(dashboardConfig?.ports?.frontend) || 5173,
	};
}

function readDashboardState() {
	if (!fs.existsSync(stateFile)) {
		return null;
	}

	try {
		return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
	} catch (error) {
		return null;
	}
}

function writeDashboardState(state) {
	ensureLogsDirectory();
	fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function removeDashboardState() {
	if (!fs.existsSync(stateFile)) {
		return;
	}

	fs.rmSync(stateFile, { force: true });
}

function isProcessAlive(pid) {
	const normalizedPid = Number(pid);
	if (!Number.isInteger(normalizedPid) || normalizedPid <= 0) {
		return false;
	}

	try {
		process.kill(normalizedPid, 0);
		return true;
	} catch (error) {
		return error?.code === 'EPERM';
	}
}

function getLogPaths() {
	return {
		serverOut: path.join(logsDir, 'server-dev.out.log'),
		serverErr: path.join(logsDir, 'server-dev.err.log'),
		clientOut: path.join(logsDir, 'client-dev.out.log'),
		clientErr: path.join(logsDir, 'client-dev.err.log'),
	};
}

function spawnDashboardTarget(target, outLogPath, errLogPath) {
	const outFd = fs.openSync(outLogPath, 'a');
	const errFd = fs.openSync(errLogPath, 'a');

	try {
		const childProcess = spawnNpm(['run', 'dev', '--prefix', target], {
			cwd: rootDir,
			detached: true,
			stdio: ['ignore', outFd, errFd],
			env: {
				...process.env,
				FORCE_COLOR: '0',
				NO_COLOR: '1',
				CLICOLOR: '0',
				CLICOLOR_FORCE: '0',
				npm_config_color: 'false',
			},
		});

		childProcess.unref();
		return childProcess;
	} finally {
		fs.closeSync(outFd);
		fs.closeSync(errFd);
	}
}

function testPortAvailability(port) {
	return new Promise((resolve) => {
		const probeServer = net.createServer();

		probeServer.once('error', (error) => {
			if (error?.code === 'EADDRINUSE') {
				resolve(false);
				return;
			}

			resolve(false);
		});

		probeServer.once('listening', () => {
			probeServer.close(() => resolve(true));
		});

		probeServer.listen(port, '0.0.0.0');
	});
}

async function getOccupiedDashboardPorts() {
	const ports = getDashboardPorts();
	const occupiedPorts = [];

	for (const port of [ports.backend, ports.frontend]) {
		if (!(await testPortAvailability(port))) {
			occupiedPorts.push(port);
		}
	}

	return occupiedPorts;
}

async function ensureDashboardPortsAvailable() {
	const occupiedPorts = await getOccupiedDashboardPorts();
	if (occupiedPorts.length === 0) {
		return;
	}

	throw new Error(
		`Dashboard ports are already in use: ${occupiedPorts.join(', ')}. Run npm run app:stop first, or free those ports.`,
	);
}

async function stopProcessTree(pid) {
	const normalizedPid = Number(pid);
	if (!isProcessAlive(normalizedPid)) {
		return false;
	}

	if (process.platform === 'win32') {
		await new Promise((resolve) => {
			const killer = spawn(
				'taskkill',
				['/PID', String(normalizedPid), '/T', '/F'],
				{
					stdio: 'ignore',
					windowsHide: true,
				},
			);

			killer.on('close', () => resolve());
			killer.on('error', () => resolve());
		});

		return !isProcessAlive(normalizedPid);
	}

	try {
		process.kill(-normalizedPid, 'SIGTERM');
	} catch (error) {
		try {
			process.kill(normalizedPid, 'SIGTERM');
		} catch (fallbackError) {
			return false;
		}
	}

	await wait(1000);

	if (!isProcessAlive(normalizedPid)) {
		return true;
	}

	try {
		process.kill(-normalizedPid, 'SIGKILL');
	} catch (error) {
		try {
			process.kill(normalizedPid, 'SIGKILL');
		} catch (fallbackError) {
			return false;
		}
	}

	await wait(500);
	return !isProcessAlive(normalizedPid);
}

async function startDashboard() {
	ensureLogsDirectory();

	const existingState = readDashboardState();
	if (existingState) {
		const serverRunning = isProcessAlive(existingState?.server?.launcherPid);
		const clientRunning = isProcessAlive(existingState?.client?.launcherPid);

		if (serverRunning || clientRunning) {
			console.log('Dashboard is already running.');
			console.log(
				`Server launcher PID: ${existingState?.server?.launcherPid || 'unknown'}`,
			);
			console.log(
				`Client launcher PID: ${existingState?.client?.launcherPid || 'unknown'}`,
			);
			return;
		}

		removeDashboardState();
	}

	await ensureDashboardPortsAvailable();

	const logPaths = getLogPaths();
	const ports = getDashboardPorts();
	const serverProcess = spawnDashboardTarget(
		'server',
		logPaths.serverOut,
		logPaths.serverErr,
	);
	const clientProcess = spawnDashboardTarget(
		'client',
		logPaths.clientOut,
		logPaths.clientErr,
	);

	writeDashboardState({
		startedAt: new Date().toISOString(),
		server: {
			launcherPid: serverProcess.pid,
			port: ports.backend,
			outLog: logPaths.serverOut,
			errLog: logPaths.serverErr,
		},
		client: {
			launcherPid: clientProcess.pid,
			port: ports.frontend,
			outLog: logPaths.clientOut,
			errLog: logPaths.clientErr,
		},
	});

	await wait(3000);

	const failedTargets = [];
	if (!isProcessAlive(serverProcess.pid)) {
		failedTargets.push('server');
	}
	if (!isProcessAlive(clientProcess.pid)) {
		failedTargets.push('client');
	}

	if (failedTargets.length > 0) {
		await Promise.all([
			stopProcessTree(serverProcess.pid),
			stopProcessTree(clientProcess.pid),
		]);
		removeDashboardState();
		throw new Error(
			`Dashboard failed to start cleanly for: ${failedTargets.join(', ')}. Check logs in ${logsDir}.`,
		);
	}

	console.log('Dashboard started in the background.');
	console.log(`Server: http://localhost:${ports.backend}`);
	console.log(`Client: http://localhost:${ports.frontend}`);
	console.log(`Logs: ${logsDir}`);
}

async function stopDashboard() {
	const state = readDashboardState();
	if (!state) {
		const occupiedPorts = await getOccupiedDashboardPorts();
		if (occupiedPorts.length > 0) {
			console.log(
				'Dashboard appears to be running, but it is not managed by the launcher state file.',
			);
			console.log(`Ports in use: ${occupiedPorts.join(', ')}`);
			return;
		}

		console.log('Dashboard is already stopped.');
		return;
	}

	const stoppedTargets = [];
	for (const target of ['server', 'client']) {
		const launcherPid = Number(state?.[target]?.launcherPid);
		if (await stopProcessTree(launcherPid)) {
			stoppedTargets.push(`${target} launcher (${launcherPid})`);
		}
	}

	removeDashboardState();
	await wait(500);

	const occupiedPorts = await getOccupiedDashboardPorts();
	if (occupiedPorts.length > 0) {
		console.warn(
			`Some dashboard ports are still in use: ${occupiedPorts.join(', ')}.`,
		);
	} else {
		console.log('Dashboard stopped.');
	}

	if (stoppedTargets.length > 0) {
		console.log(`Stopped: ${stoppedTargets.join(', ')}`);
	}
}

async function showDashboardStatus() {
	const state = readDashboardState();
	const occupiedPorts = await getOccupiedDashboardPorts();

	if (!state) {
		if (occupiedPorts.length > 0) {
			console.log(
				'Dashboard appears to be running, but it is not managed by the launcher state file.',
			);
			console.log(`Ports in use: ${occupiedPorts.join(', ')}`);
			return;
		}

		console.log('Dashboard is stopped.');
		return;
	}

	const serverAlive = isProcessAlive(state?.server?.launcherPid);
	const clientAlive = isProcessAlive(state?.client?.launcherPid);
	const overallStatus =
		serverAlive || clientAlive || occupiedPorts.length > 0
			? 'running'
			: 'stopped';

	console.log(`Dashboard status: ${overallStatus}`);
	console.log(`Started at: ${state.startedAt || 'unknown'}`);
	console.log(
		`Server launcher PID: ${state?.server?.launcherPid || 'unknown'} (${serverAlive ? 'alive' : 'not running'})`,
	);
	console.log(
		`Client launcher PID: ${state?.client?.launcherPid || 'unknown'} (${clientAlive ? 'alive' : 'not running'})`,
	);

	if (occupiedPorts.length > 0) {
		console.log(`Dashboard ports currently in use: ${occupiedPorts.join(', ')}`);
	} else {
		console.log('Dashboard ports are free.');
	}
}

async function main() {
	const command = String(process.argv[2] || '').trim().toLowerCase();

	try {
		switch (command) {
			case 'start':
				await startDashboard();
				return;
			case 'stop':
				await stopDashboard();
				return;
			case 'status':
				await showDashboardStatus();
				return;
			default:
				console.error(
					'Usage: node ./scripts/dashboard-dev-cli.js <start|stop|status>',
				);
				process.exitCode = 1;
		}
	} catch (error) {
		console.error(error.message || String(error));
		process.exitCode = 1;
	}
}

void main();
