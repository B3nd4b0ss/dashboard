const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { processes } = require('./runtimeRegistry');
const { getProjectPath } = require('../utils/projectPaths');

const HEALTH_CACHE_TTL_MS = 5000;
const HEALTH_TIMEOUT_MS = 3000;
const STARTUP_GRACE_MS = 12000;
const WORKSPACE_CACHE_TTL_MS = 30000;
const POWERSHELL_COMMAND = fs.existsSync(
	path.join(
		process.env.SystemRoot || 'C:\\Windows',
		'System32',
		'WindowsPowerShell',
		'v1.0',
		'powershell.exe',
	),
)
	? path.join(
			process.env.SystemRoot || 'C:\\Windows',
			'System32',
			'WindowsPowerShell',
			'v1.0',
			'powershell.exe',
		)
	: 'powershell.exe';

const serviceStates = {};
const processCpuSamples = new Map();
const workspaceCache = new Map();

/**
 * Normalizes project names for use as internal monitoring map keys.
 *
 * @param {string} projectName - Project name to normalize.
 * @returns {string} Lower-cased project key.
 */
function getProjectKey(projectName) {
	return String(projectName || '')
		.trim()
		.toLowerCase();
}

/**
 * Ensures a monitoring state bucket exists for a project.
 *
 * @param {string} projectName - Project whose state bucket should exist.
 * @returns {Record<string, object>} Mutable project monitoring state.
 */
function ensureProjectState(projectName) {
	const projectKey = getProjectKey(projectName);
	if (!serviceStates[projectKey]) {
		serviceStates[projectKey] = {};
	}

	return serviceStates[projectKey];
}

/**
 * Creates the default monitoring state for one managed service.
 *
 * @returns {object} Fresh monitoring state object.
 */
function createDefaultServiceState() {
	return {
		launchCount: 0,
		crashCount: 0,
		failedHealthChecks: 0,
		totalHealthChecks: 0,
		lastStartedAt: null,
		lastExitedAt: null,
		lastExitCode: null,
		lastExitSignal: null,
		lastCrashAt: null,
		lastCheckedAt: null,
		lastSuccessfulAt: null,
		lastResponseTimeMs: null,
		lastSuccessfulResponseTimeMs: null,
		lastStatusCode: null,
		lastError: null,
		lastHealthStatus: null,
		lastPid: null,
		lastStopRequestedAt: null,
	};
}

/**
 * Ensures a monitoring state entry exists for a specific project service.
 *
 * @param {string} projectName - Project that owns the service.
 * @param {'frontend' | 'backend'} serviceName - Managed service name.
 * @returns {object} Mutable service monitoring state.
 */
function ensureServiceState(projectName, serviceName) {
	const projectState = ensureProjectState(projectName);
	if (!projectState[serviceName]) {
		projectState[serviceName] = createDefaultServiceState();
	}

	return projectState[serviceName];
}

function getRestartCount(serviceState) {
	return Math.max(0, serviceState.launchCount - 1);
}

/**
 * Clears cached monitoring data for a project.
 *
 * @param {string} projectName - Project whose monitoring state should be reset.
 * @returns {void}
 */
function clearProjectMonitoringState(projectName) {
	const projectKey = getProjectKey(projectName);
	delete serviceStates[projectKey];
	workspaceCache.delete(projectKey);
}

/**
 * Moves monitoring state to a new project name after a rename.
 *
 * @param {string} oldName - Previous project name.
 * @param {string} nextName - New project name.
 * @returns {void}
 */
function renameProjectMonitoringState(oldName, nextName) {
	const oldKey = getProjectKey(oldName);
	const nextKey = getProjectKey(nextName);

	if (!oldKey || oldKey === nextKey) {
		return;
	}

	if (serviceStates[oldKey]) {
		serviceStates[nextKey] = serviceStates[oldKey];
		delete serviceStates[oldKey];
	}

	if (workspaceCache.has(oldKey)) {
		workspaceCache.set(nextKey, workspaceCache.get(oldKey));
		workspaceCache.delete(oldKey);
	}
}

/**
 * Invalidates cached workspace disk metrics for a project.
 *
 * @param {string} projectName - Project whose cached workspace metrics should be cleared.
 * @returns {void}
 */
function invalidateProjectWorkspaceMetrics(projectName) {
	workspaceCache.delete(getProjectKey(projectName));
}

/**
 * Records that a managed service has been launched.
 *
 * @param {string} projectName - Project that owns the service.
 * @param {'frontend' | 'backend'} serviceName - Managed service name.
 * @param {import('child_process').ChildProcess | null} proc - Spawned child process.
 * @returns {void}
 */
function recordServiceLaunch(projectName, serviceName, proc) {
	const serviceState = ensureServiceState(projectName, serviceName);
	serviceState.launchCount += 1;
	serviceState.lastStartedAt = new Date().toISOString();
	serviceState.lastExitedAt = null;
	serviceState.lastExitCode = null;
	serviceState.lastExitSignal = null;
	serviceState.lastStatusCode = null;
	serviceState.lastError = null;
	serviceState.lastHealthStatus = 'starting';
	serviceState.lastResponseTimeMs = null;
	serviceState.lastSuccessfulResponseTimeMs = null;
	serviceState.lastCheckedAt = null;
	serviceState.lastPid = proc?.pid || null;
	serviceState.lastStopRequestedAt = null;

	if (proc?.pid) {
		processCpuSamples.delete(proc.pid);
	}
}

/**
 * Records that the dashboard requested a managed service to stop.
 *
 * @param {string} projectName - Project that owns the service.
 * @param {'frontend' | 'backend'} serviceName - Managed service name.
 * @returns {void}
 */
function recordServiceStopRequest(projectName, serviceName) {
	const serviceState = ensureServiceState(projectName, serviceName);
	serviceState.lastStopRequestedAt = new Date().toISOString();
}

/**
 * Records how a managed service exited.
 *
 * @param {string} projectName - Project that owns the service.
 * @param {'frontend' | 'backend'} serviceName - Managed service name.
 * @param {{code?: number | null, signal?: string | null, expected?: boolean, pid?: number | null, errorMessage?: string | null}} [details={}] - Exit details collected from the child process.
 * @returns {void}
 */
function recordServiceExit(
	projectName,
	serviceName,
	{
		code = null,
		signal = null,
		expected = false,
		pid = null,
		errorMessage = null,
	} = {},
) {
	const serviceState = ensureServiceState(projectName, serviceName);
	const exitedAt = new Date().toISOString();
	const hadUnexpectedFailure =
		!expected &&
		(Boolean(errorMessage) ||
			(code !== null && code !== 0) ||
			(signal && signal !== 'SIGTERM'));

	serviceState.lastExitedAt = exitedAt;
	serviceState.lastExitCode = code;
	serviceState.lastExitSignal = signal;
	serviceState.lastPid = null;
	serviceState.lastHealthStatus = 'offline';

	if (errorMessage) {
		serviceState.lastError = errorMessage;
	}

	if (hadUnexpectedFailure) {
		serviceState.crashCount += 1;
		serviceState.lastCrashAt = exitedAt;
	}

	if (pid) {
		processCpuSamples.delete(pid);
	}
}

function roundMetric(value, digits = 1) {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Number(value.toFixed(digits));
}

function runPowerShell(command) {
	return new Promise((resolve) => {
		execFile(
			POWERSHELL_COMMAND,
			['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
			{
				windowsHide: true,
				maxBuffer: 1024 * 1024,
			},
			(error, stdout) => {
				if (error) {
					console.warn(
						`[monitoring] PowerShell sampling failed: ${error.message}`,
					);
					resolve('');
					return;
				}

				resolve(stdout || '');
			},
		);
	});
}

async function readProcessMetrics(pids) {
	const uniquePids = [...new Set(pids)]
		.map((pid) => Number(pid))
		.filter((pid) => Number.isInteger(pid) && pid > 0);

	if (uniquePids.length === 0) {
		return new Map();
	}

	if (process.platform !== 'win32') {
		return new Map();
	}

	const powerShellCommand = [
		`$ids=@(${uniquePids.join(',')})`,
		'$lines = foreach ($id in $ids) {',
		'  try {',
		'    $proc = Get-Process -Id $id -ErrorAction Stop',
		'    "$($proc.Id)|$([double]$proc.CPU)|$([int64]$proc.WorkingSet64)|$($proc.StartTime.Ticks)|$($proc.ProcessName)"',
		'  } catch { }',
		'}',
		'if ($null -eq $lines) { \'\' } else { @($lines) -join "`n" }',
	].join('; ');

	const rawEntries = String(await runPowerShell(powerShellCommand))
		.split(/\r?\n/)
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [id, cpu, workingSet, startTicks, processName] =
				entry.split('|');

			return {
				Id: Number(id),
				CPU: Number(cpu),
				WorkingSet64: Number(workingSet),
				StartTimeTicks: Number(startTicks),
				ProcessName: processName || null,
			};
		});
	const metrics = new Map();
	const sampledAt = Date.now();
	const cpuCount = Math.max(os.cpus().length, 1);

	for (const entry of rawEntries) {
		const pid = Number(entry.Id);
		if (!Number.isInteger(pid) || pid <= 0) {
			continue;
		}

		const cpuSeconds = Number(entry.CPU) || 0;
		const previousSample = processCpuSamples.get(pid);
		let cpuPercent = 0;

		if (previousSample) {
			const elapsedSeconds =
				(sampledAt - previousSample.sampledAt) / 1000;
			if (elapsedSeconds > 0) {
				const deltaCpuSeconds = Math.max(
					0,
					cpuSeconds - previousSample.cpuSeconds,
				);
				cpuPercent = roundMetric(
					(deltaCpuSeconds / (elapsedSeconds * cpuCount)) * 100,
				);
			}
		}

		processCpuSamples.set(pid, {
			cpuSeconds,
			sampledAt,
		});

		metrics.set(pid, {
			pid,
			processName: entry.ProcessName || null,
			cpuPercent,
			memoryBytes: Number(entry.WorkingSet64) || 0,
			startedAt:
				Number(entry.StartTimeTicks) > 0
					? new Date(
							(Number(entry.StartTimeTicks) -
								621355968000000000) /
								10000,
						).toISOString()
					: null,
		});
	}

	for (const pid of uniquePids) {
		if (!metrics.has(pid)) {
			processCpuSamples.delete(pid);
		}
	}

	return metrics;
}

async function getDirectorySize(rootPath) {
	let totalSize = 0;
	const stack = [rootPath];

	while (stack.length > 0) {
		const currentPath = stack.pop();
		let entries = [];

		try {
			entries = await fs.promises.readdir(currentPath, {
				withFileTypes: true,
			});
		} catch (error) {
			continue;
		}

		for (const entry of entries) {
			const fullPath = path.join(currentPath, entry.name);

			try {
				if (entry.isDirectory()) {
					stack.push(fullPath);
					continue;
				}

				if (entry.isFile()) {
					const stats = await fs.promises.stat(fullPath);
					totalSize += stats.size;
				}
			} catch (error) {
				continue;
			}
		}
	}

	return totalSize;
}

async function getWorkspaceMetrics(project) {
	const projectKey = getProjectKey(project.name);
	const cached = workspaceCache.get(projectKey);
	const now = Date.now();

	if (cached && now - cached.capturedAt < WORKSPACE_CACHE_TTL_MS) {
		return cached.value;
	}

	const projectPath = getProjectPath(project);
	const metrics = {
		workspaceSizeBytes: null,
		driveFreeBytes: null,
		driveTotalBytes: null,
		driveUsagePercent: null,
	};

	try {
		if (fs.existsSync(projectPath)) {
			metrics.workspaceSizeBytes = await getDirectorySize(projectPath);
		}
	} catch (error) {
		metrics.workspaceSizeBytes = null;
	}

	try {
		if (
			typeof fs.promises.statfs === 'function' &&
			fs.existsSync(projectPath)
		) {
			const statfs = await fs.promises.statfs(projectPath);
			const blockSize = Number(statfs.bsize || statfs.frsize || 0);
			const totalBlocks = Number(statfs.blocks || 0);
			const freeBlocks = Number(statfs.bavail || statfs.bfree || 0);

			if (blockSize > 0 && totalBlocks > 0) {
				metrics.driveTotalBytes = blockSize * totalBlocks;
				metrics.driveFreeBytes = blockSize * freeBlocks;
				metrics.driveUsagePercent = roundMetric(
					((metrics.driveTotalBytes - metrics.driveFreeBytes) /
						metrics.driveTotalBytes) *
						100,
				);
			}
		}
	} catch (error) {
		metrics.driveFreeBytes = null;
		metrics.driveTotalBytes = null;
		metrics.driveUsagePercent = null;
	}

	workspaceCache.set(projectKey, {
		capturedAt: now,
		value: metrics,
	});

	return metrics;
}

async function refreshServiceHealth(
	projectName,
	serviceName,
	serviceInfo,
	pid,
) {
	const serviceState = ensureServiceState(projectName, serviceName);
	const running = Boolean(serviceInfo?.running && pid);

	if (!running || !serviceInfo?.url) {
		serviceState.lastHealthStatus = 'offline';
		return;
	}

	if (serviceState.lastCheckedAt) {
		const lastCheckedAtMs = Date.parse(serviceState.lastCheckedAt);
		if (Number.isFinite(lastCheckedAtMs)) {
			const age = Date.now() - lastCheckedAtMs;
			if (age < HEALTH_CACHE_TTL_MS && serviceState.lastPid === pid) {
				return;
			}
		}
	}

	const startedAtMs = serviceState.lastStartedAt
		? Date.parse(serviceState.lastStartedAt)
		: null;
	const withinStartupGrace =
		Number.isFinite(startedAtMs) &&
		Date.now() - startedAtMs < STARTUP_GRACE_MS;

	const requestStartedAt = Date.now();
	let statusCode = null;
	let responseTimeMs = null;
	let errorMessage = null;
	let healthy = false;

	try {
		const response = await fetch(serviceInfo.url, {
			signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
		});
		statusCode = response.status;
		responseTimeMs = Date.now() - requestStartedAt;
		healthy = response.ok;
		await response.arrayBuffer().catch(() => null);
	} catch (error) {
		responseTimeMs = Date.now() - requestStartedAt;
		errorMessage =
			error?.name === 'TimeoutError'
				? 'Health check timed out.'
				: error?.message || 'Health check failed.';
	}

	serviceState.totalHealthChecks += 1;
	serviceState.lastCheckedAt = new Date().toISOString();
	serviceState.lastResponseTimeMs = responseTimeMs;
	serviceState.lastStatusCode = statusCode;
	serviceState.lastPid = pid;

	if (healthy) {
		serviceState.lastSuccessfulAt = serviceState.lastCheckedAt;
		serviceState.lastSuccessfulResponseTimeMs = responseTimeMs;
		serviceState.lastError = null;
		serviceState.lastHealthStatus = 'healthy';
		return;
	}

	serviceState.lastError =
		errorMessage ||
		(statusCode ? `Health check returned ${statusCode}.` : null);

	if (withinStartupGrace) {
		serviceState.lastHealthStatus = 'starting';
		return;
	}

	serviceState.failedHealthChecks += 1;
	serviceState.lastHealthStatus = 'degraded';
}

function getServiceHealthStatus(serviceState, running) {
	if (!running) {
		return 'offline';
	}

	if (serviceState.lastHealthStatus) {
		return serviceState.lastHealthStatus;
	}

	if (serviceState.lastStartedAt) {
		const startedAtMs = Date.parse(serviceState.lastStartedAt);
		if (
			Number.isFinite(startedAtMs) &&
			Date.now() - startedAtMs < STARTUP_GRACE_MS
		) {
			return 'starting';
		}
	}

	return 'unknown';
}

function buildServiceMonitoringSnapshot(
	projectName,
	serviceName,
	serviceInfo,
	pid,
	processMetric,
) {
	const serviceState = ensureServiceState(projectName, serviceName);
	const running = Boolean(serviceInfo?.running && pid);
	const startedAt =
		serviceState.lastStartedAt ||
		(running && processMetric?.startedAt) ||
		null;
	const startedAtMs = startedAt ? Date.parse(startedAt) : null;

	return {
		name: serviceName,
		running,
		pid: running ? pid : null,
		url: serviceInfo?.url || null,
		port: serviceInfo?.port || null,
		cpuPercent: running ? processMetric?.cpuPercent || 0 : 0,
		memoryBytes: running ? processMetric?.memoryBytes || 0 : 0,
		uptimeMs:
			running && Number.isFinite(startedAtMs)
				? Math.max(0, Date.now() - startedAtMs)
				: null,
		startedAt,
		launchCount: serviceState.launchCount,
		restartCount: getRestartCount(serviceState),
		crashCount: serviceState.crashCount,
		lastExitAt: serviceState.lastExitedAt,
		lastExitCode: serviceState.lastExitCode,
		lastExitSignal: serviceState.lastExitSignal,
		lastCrashAt: serviceState.lastCrashAt,
		responseTimeMs: Number.isFinite(serviceState.lastResponseTimeMs)
			? Math.round(serviceState.lastResponseTimeMs)
			: null,
		statusCode: serviceState.lastStatusCode,
		healthStatus: getServiceHealthStatus(serviceState, running),
		failedRequestCount: serviceState.failedHealthChecks,
		totalHealthChecks: serviceState.totalHealthChecks,
		lastCheckedAt: serviceState.lastCheckedAt,
		lastSuccessfulAt: serviceState.lastSuccessfulAt,
		lastSuccessfulResponseTimeMs: Number.isFinite(
			serviceState.lastSuccessfulResponseTimeMs,
		)
			? Math.round(serviceState.lastSuccessfulResponseTimeMs)
			: null,
		lastError: serviceState.lastError,
	};
}

/**
 * Builds a monitoring snapshot from the current in-memory runtime state.
 *
 * @param {object} project - Project record to summarize.
 * @param {object} runtimeSnapshot - Runtime snapshot previously built for the project.
 * @returns {object} Monitoring snapshot suitable for fast API responses.
 */
function createProjectMonitoringSnapshot(project, runtimeSnapshot) {
	const serviceSnapshots = {};

	for (const serviceName of ['frontend', 'backend']) {
		if (!runtimeSnapshot?.services?.[serviceName]) {
			serviceSnapshots[serviceName] = null;
			continue;
		}

		serviceSnapshots[serviceName] = buildServiceMonitoringSnapshot(
			project.name,
			serviceName,
			runtimeSnapshot.services[serviceName],
			processes[project.name]?.[serviceName]?.pid || null,
			null,
		);
	}

	const services = Object.values(serviceSnapshots).filter(Boolean);
	const responseTimes = services
		.map((service) => service.responseTimeMs)
		.filter((value) => Number.isFinite(value));

	let monitoringStatus = 'offline';
	if (runtimeSnapshot?.activeServiceCount > 0) {
		const healthStates = services.map((service) => service.healthStatus);
		if (runtimeSnapshot.status === 'partial') {
			monitoringStatus = 'degraded';
		} else if (healthStates.some((value) => value === 'degraded')) {
			monitoringStatus = 'degraded';
		} else if (
			healthStates.some(
				(value) => value === 'starting' || value === 'unknown',
			)
		) {
			monitoringStatus = 'starting';
		} else {
			monitoringStatus = 'healthy';
		}
	}

	return {
		status: monitoringStatus,
		cpuPercent: roundMetric(
			services.reduce(
				(total, service) => total + (service.cpuPercent || 0),
				0,
			),
		),
		memoryBytes: services.reduce(
			(total, service) => total + (service.memoryBytes || 0),
			0,
		),
		averageResponseTimeMs: responseTimes.length
			? Math.round(
					responseTimes.reduce((total, value) => total + value, 0) /
						responseTimes.length,
				)
			: null,
		failedRequestCount: services.reduce(
			(total, service) => total + (service.failedRequestCount || 0),
			0,
		),
		totalHealthChecks: services.reduce(
			(total, service) => total + (service.totalHealthChecks || 0),
			0,
		),
		restartCount: services.reduce(
			(total, service) => total + (service.restartCount || 0),
			0,
		),
		crashCount: services.reduce(
			(total, service) => total + (service.crashCount || 0),
			0,
		),
		workspaceSizeBytes: null,
		driveFreeBytes: null,
		driveTotalBytes: null,
		driveUsagePercent: null,
		lastCheckedAt:
			services
				.map((service) => service.lastCheckedAt)
				.filter(Boolean)
				.sort()
				.at(-1) || null,
		services: serviceSnapshots,
	};
}

/**
 * Builds monitoring snapshots for a list of projects, including health and workspace metrics.
 *
 * @param {Array<object>} projects - Projects to inspect.
 * @param {Map<string, object> | null} [runtimeSnapshotMap=null] - Optional precomputed runtime snapshots keyed by lower-cased project name.
 * @returns {Promise<Map<string, object>>} Monitoring snapshots keyed by lower-cased project name.
 */
async function getProjectMonitoringMap(projects, runtimeSnapshotMap = null) {
	const serviceDescriptors = [];

	for (const project of projects) {
		const projectKey = getProjectKey(project.name);
		const runtimeSnapshot = runtimeSnapshotMap?.get(projectKey);
		const runtime = runtimeSnapshot || { services: {} };
		const runtimeEntry = processes[project.name] || {};

		for (const serviceName of ['frontend', 'backend']) {
			const serviceInfo = runtime.services?.[serviceName];
			const proc = runtimeEntry[serviceName];

			if (serviceInfo?.running && proc?.pid) {
				serviceDescriptors.push({
					projectName: project.name,
					serviceName,
					serviceInfo,
					pid: proc.pid,
				});
			}
		}
	}

	const processMetrics = await readProcessMetrics(
		serviceDescriptors.map((service) => service.pid),
	);

	await Promise.all(
		serviceDescriptors.map((service) =>
			refreshServiceHealth(
				service.projectName,
				service.serviceName,
				service.serviceInfo,
				service.pid,
			),
		),
	);

	const workspaceMetricsEntries = await Promise.all(
		projects.map(async (project) => [
			getProjectKey(project.name),
			await getWorkspaceMetrics(project),
		]),
	);
	const workspaceMetricsMap = new Map(workspaceMetricsEntries);
	const monitoringMap = new Map();

	for (const project of projects) {
		const projectKey = getProjectKey(project.name);
		const runtimeSnapshot = runtimeSnapshotMap?.get(projectKey);
		const monitoringSnapshot = createProjectMonitoringSnapshot(
			project,
			runtimeSnapshot,
		);
		const runtimeEntry = processes[project.name] || {};

		for (const serviceName of ['frontend', 'backend']) {
			const serviceInfo = runtimeSnapshot?.services?.[serviceName];
			if (!serviceInfo) {
				continue;
			}

			monitoringSnapshot.services[serviceName] =
				buildServiceMonitoringSnapshot(
					project.name,
					serviceName,
					serviceInfo,
					runtimeEntry[serviceName]?.pid || null,
					processMetrics.get(runtimeEntry[serviceName]?.pid),
				);
		}

		const serviceSnapshots = Object.values(
			monitoringSnapshot.services,
		).filter(Boolean);
		const responseTimes = serviceSnapshots
			.map((service) => service.responseTimeMs)
			.filter((value) => Number.isFinite(value));

		monitoringSnapshot.cpuPercent = roundMetric(
			serviceSnapshots.reduce(
				(total, service) => total + (service.cpuPercent || 0),
				0,
			),
		);
		monitoringSnapshot.memoryBytes = serviceSnapshots.reduce(
			(total, service) => total + (service.memoryBytes || 0),
			0,
		);
		monitoringSnapshot.averageResponseTimeMs = responseTimes.length
			? Math.round(
					responseTimes.reduce((total, value) => total + value, 0) /
						responseTimes.length,
				)
			: null;
		monitoringSnapshot.failedRequestCount = serviceSnapshots.reduce(
			(total, service) => total + (service.failedRequestCount || 0),
			0,
		);
		monitoringSnapshot.totalHealthChecks = serviceSnapshots.reduce(
			(total, service) => total + (service.totalHealthChecks || 0),
			0,
		);
		monitoringSnapshot.restartCount = serviceSnapshots.reduce(
			(total, service) => total + (service.restartCount || 0),
			0,
		);
		monitoringSnapshot.crashCount = serviceSnapshots.reduce(
			(total, service) => total + (service.crashCount || 0),
			0,
		);
		monitoringSnapshot.lastCheckedAt =
			serviceSnapshots
				.map((service) => service.lastCheckedAt)
				.filter(Boolean)
				.sort()
				.at(-1) || null;

		const workspaceMetrics = workspaceMetricsMap.get(projectKey);
		if (workspaceMetrics) {
			Object.assign(monitoringSnapshot, workspaceMetrics);
		}

		monitoringMap.set(projectKey, monitoringSnapshot);
	}

	return monitoringMap;
}

module.exports = {
	getProjectMonitoringMap,
	createProjectMonitoringSnapshot,
	recordServiceLaunch,
	recordServiceStopRequest,
	recordServiceExit,
	invalidateProjectWorkspaceMetrics,
	renameProjectMonitoringState,
	clearProjectMonitoringState,
};
