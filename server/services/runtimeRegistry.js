const {
	getFrontendTemplateDefinition,
	getBackendTemplateDefinition,
	templateHasManagedService,
} = require('./projectTemplates');

const processes = {};

/**
 * Checks whether a tracked child process still looks alive.
 *
 * @param {import('child_process').ChildProcess | undefined | null} proc - Child process reference stored in the runtime registry.
 * @returns {boolean} True when the process still appears to be running.
 */
function isChildProcessAlive(proc) {
	if (!proc || !proc.pid) {
		return false;
	}

	if (proc.exitCode !== null || proc.signalCode !== null || proc.killed) {
		return false;
	}

	try {
		process.kill(proc.pid, 0);
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Removes dead child processes from the in-memory runtime registry.
 *
 * @returns {void}
 */
function pruneRuntimeRegistry() {
	for (const [projectName, runtime] of Object.entries(processes)) {
		if (runtime.frontend && !isChildProcessAlive(runtime.frontend)) {
			delete runtime.frontend;
		}

		if (runtime.backend && !isChildProcessAlive(runtime.backend)) {
			delete runtime.backend;
		}

		if (!runtime.frontend && !runtime.backend) {
			delete processes[projectName];
		}
	}
}

/**
 * Returns the currently running managed services for a project.
 *
 * @param {string} projectName - Project name used as the registry key.
 * @returns {Array<'frontend' | 'backend'>} Service names that are still alive.
 */
function getRunningServices(projectName) {
	pruneRuntimeRegistry();

	const runtime = processes[projectName];
	if (!runtime) {
		return [];
	}

	return ['frontend', 'backend'].filter((serviceName) =>
		isChildProcessAlive(runtime[serviceName]),
	);
}

/**
 * Builds the runtime status object attached to project API responses.
 *
 * @param {object} project - Persisted project record containing template and port information.
 * @returns {{status: string, activeServiceCount: number, expectedServiceCount: number, frontendRunning: boolean, backendRunning: boolean, services: {frontend: object | null, backend: object | null}}} Runtime snapshot for the project.
 */
function getProjectRuntimeSnapshot(project) {
	pruneRuntimeRegistry();

	const runtime = processes[project.name] || {};
	const frontendDefinition = getFrontendTemplateDefinition(project.frontend);
	const backendDefinition = getBackendTemplateDefinition(project.backend);
	const frontendManaged = templateHasManagedService(frontendDefinition);
	const backendManaged = templateHasManagedService(backendDefinition);
	const frontendRunning =
		frontendManaged && isChildProcessAlive(runtime.frontend);
	const backendRunning =
		backendManaged && isChildProcessAlive(runtime.backend);
	const expectedServiceCount =
		Number(frontendManaged) + Number(backendManaged);
	const activeServiceCount = Number(frontendRunning) + Number(backendRunning);

	let status = 'stopped';
	if (expectedServiceCount === 0) {
		status = project.status || 'stopped';
	} else if (activeServiceCount === expectedServiceCount) {
		status = 'running';
	} else if (activeServiceCount > 0) {
		status = 'partial';
	}

	return {
		status,
		activeServiceCount,
		expectedServiceCount,
		frontendRunning,
		backendRunning,
		services: {
			frontend: frontendManaged
				? {
						type: project.frontend,
						port: project.frontendPort,
						running: frontendRunning,
						url: `http://localhost:${project.frontendPort}`,
					}
				: null,
			backend: backendManaged
				? {
						type: project.backend,
						port: project.backendPort,
						running: backendRunning,
						url: `http://localhost:${project.backendPort}`,
					}
				: null,
		},
	};
}

module.exports = {
	processes,
	isChildProcessAlive,
	pruneRuntimeRegistry,
	getRunningServices,
	getProjectRuntimeSnapshot,
};
