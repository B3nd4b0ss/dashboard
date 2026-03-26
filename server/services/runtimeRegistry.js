const processes = {};

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

function getProjectRuntimeSnapshot(project) {
	pruneRuntimeRegistry();

	const runtime = processes[project.name] || {};
	const frontendRunning =
		Boolean(project.frontend) && isChildProcessAlive(runtime.frontend);
	const backendRunning =
		Boolean(project.backend) && isChildProcessAlive(runtime.backend);
	const expectedServiceCount =
		Number(Boolean(project.frontend)) + Number(Boolean(project.backend));
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
			frontend: project.frontend
				? {
						type: project.frontend,
						port: project.frontendPort,
						running: frontendRunning,
						url: `http://localhost:${project.frontendPort}`,
					}
				: null,
			backend: project.backend
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
