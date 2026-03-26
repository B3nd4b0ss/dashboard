const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const kill = require('tree-kill');
const { PROJECTS_DIR } = require('../config/constants');
const { loadProjects, saveProjects } = require('../utils/fileOperations');
const { findProject } = require('../utils/helpers');
const {
	startContainer,
	stopContainer,
	getContainerStatus,
} = require('./docker');
const { getDatabaseById } = require('./databaseService');
const { assertPortAvailable } = require('./portRegistry');
const {
	processes,
	isChildProcessAlive,
	pruneRuntimeRegistry,
	getRunningServices,
	getProjectRuntimeSnapshot,
} = require('./runtimeRegistry');

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function updatePersistedProjectStatus(projectName) {
	const projects = loadProjects();
	const project = findProject(projects, projectName);

	if (!project) {
		return;
	}

	project.status = getProjectRuntimeSnapshot(project).status;
	saveProjects(projects);
}

function clearTrackedService(projectName, serviceName) {
	const runtime = processes[projectName];

	if (!runtime) {
		return;
	}

	delete runtime[serviceName];

	if (!runtime.frontend && !runtime.backend) {
		delete processes[projectName];
	}
}

function attachProcessListeners(projectName, serviceName, proc) {
	proc.on('error', (error) => {
		console.error(
			`Failed to start ${serviceName} for ${projectName}:`,
			error.message,
		);
		clearTrackedService(projectName, serviceName);
		updatePersistedProjectStatus(projectName);
	});

	proc.on('exit', (code, signal) => {
		clearTrackedService(projectName, serviceName);
		updatePersistedProjectStatus(projectName);

		if (proc.__dashboardStopping) {
			return;
		}

		if (code !== 0 && code !== null) {
			console.error(
				`${serviceName} for ${projectName} exited with code ${code}`,
			);
		} else if (signal && signal !== 'SIGTERM') {
			console.error(
				`${serviceName} for ${projectName} exited with signal ${signal}`,
			);
		}
	});
}

function pipeProcessOutput(projectName, serviceName, proc) {
	const prefix = `[${projectName}:${serviceName}] `;

	if (proc.stdout) {
		proc.stdout.on('data', (chunk) => {
			process.stdout.write(prefix + chunk.toString());
		});
	}

	if (proc.stderr) {
		proc.stderr.on('data', (chunk) => {
			process.stderr.write(prefix + chunk.toString());
		});
	}
}

function getValidatedServicePath(projectPath, projectName, serviceName) {
	const servicePath = path.join(projectPath, serviceName);
	const packagePath = path.join(servicePath, 'package.json');

	if (!fs.existsSync(servicePath)) {
		throw new Error(
			`${serviceName} workspace not found for ${projectName}. Expected ${servicePath}`,
		);
	}

	if (!fs.existsSync(packagePath)) {
		throw new Error(
			`${serviceName} package.json not found for ${projectName}. Expected ${packagePath}`,
		);
	}

	return servicePath;
}

function resolveServiceCommand(project, servicePath, serviceName) {
	if (serviceName === 'frontend' && project.frontend === 'vite-react') {
		const viteBin = path.join(
			servicePath,
			'node_modules',
			'vite',
			'bin',
			'vite.js',
		);

		if (!fs.existsSync(viteBin)) {
			throw new Error(
				`Vite binary not found for ${project.name}. Expected ${viteBin}`,
			);
		}

		return {
			command: process.execPath,
			args: [viteBin],
		};
	}

	if (serviceName === 'backend' && project.backend === 'node') {
		const nodemonBin = path.join(
			servicePath,
			'node_modules',
			'nodemon',
			'bin',
			'nodemon.js',
		);
		const backendEntry = path.join(servicePath, 'index.js');

		if (!fs.existsSync(nodemonBin)) {
			throw new Error(
				`Nodemon binary not found for ${project.name}. Expected ${nodemonBin}`,
			);
		}

		if (!fs.existsSync(backendEntry)) {
			throw new Error(
				`Backend entry file not found for ${project.name}. Expected ${backendEntry}`,
			);
		}

		return {
			command: process.execPath,
			args: [nodemonBin, 'index.js'],
		};
	}

	throw new Error(
		`Unsupported ${serviceName} runtime for ${project.name}: ${project[serviceName] || 'unknown'}`,
	);
}

function spawnProjectService(servicePath, project, serviceName) {
	const env =
		serviceName === 'backend'
			? { ...process.env, PORT: project.backendPort }
			: { ...process.env };
	const { command, args } = resolveServiceCommand(
		project,
		servicePath,
		serviceName,
	);

	const proc = spawn(command, args, {
		cwd: servicePath,
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true,
		env,
	});

	pipeProcessOutput(project.name, serviceName, proc);
	attachProcessListeners(project.name, serviceName, proc);
	return proc;
}

function terminateProcess(proc) {
	return new Promise((resolve) => {
		if (!proc || !proc.pid) {
			resolve();
			return;
		}

		proc.__dashboardStopping = true;
		kill(proc.pid, 'SIGTERM', () => resolve());
	});
}

async function startProject(name) {
	pruneRuntimeRegistry();

	const projects = loadProjects();
	const project = findProject(projects, name);

	if (!project) {
		throw new Error('Project not found');
	}

	const projectPath = path.join(PROJECTS_DIR, project.name);
	const runtime = processes[project.name] || {};
	const servicePaths = {};
	const servicesToStart = [];

	if (project.frontend && !isChildProcessAlive(runtime.frontend)) {
		servicePaths.frontend = getValidatedServicePath(
			projectPath,
			project.name,
			'frontend',
		);

		assertPortAvailable(project.frontendPort, {
			label: 'Frontend port',
			excludeProjectName: project.name,
		});

		servicesToStart.push('frontend');
	}

	if (project.backend && !isChildProcessAlive(runtime.backend)) {
		servicePaths.backend = getValidatedServicePath(
			projectPath,
			project.name,
			'backend',
		);

		assertPortAvailable(project.backendPort, {
			label: 'Backend port',
			excludeProjectName: project.name,
		});

		servicesToStart.push('backend');
	}

	if (servicesToStart.length === 0) {
		return {
			message:
				getRunningServices(project.name).length > 0
					? 'Already running'
					: 'Nothing to start',
		};
	}

	if (project.databaseId) {
		const db = getDatabaseById(project.databaseId);
		if (db && db.containerName) {
			const status = await getContainerStatus(db.containerName);
			if (status !== 'running') {
				assertPortAvailable(db.port, {
					label: 'Database port',
					excludeDatabaseId: db.id,
				});
			}

			await startContainer(db.containerName);
		}
	}

	processes[project.name] = runtime;

	for (const serviceName of servicesToStart) {
		runtime[serviceName] = spawnProjectService(
			servicePaths[serviceName],
			project,
			serviceName,
		);
	}

	await wait(700);

	const snapshot = getProjectRuntimeSnapshot(project);
	if (snapshot.activeServiceCount === 0) {
		await Promise.all(
			servicesToStart.map((serviceName) =>
				terminateProcess(runtime[serviceName]),
			),
		);
		delete processes[project.name];
		updatePersistedProjectStatus(project.name);
		throw new Error(
			'Failed to start any services. Check the console for details.',
		);
	}

	updatePersistedProjectStatus(project.name);
	console.log(
		`Project ${name} started. Running projects:`,
		Object.keys(processes),
	);

	return {
		message:
			snapshot.status === 'partial' ? 'Started with warnings' : 'Started',
	};
}

async function stopProject(name) {
	pruneRuntimeRegistry();

	const projects = loadProjects();
	const project = findProject(projects, name);

	if (!project) {
		throw new Error('Project not found');
	}

	const runtime = processes[project.name];

	if (runtime) {
		await Promise.all([
			terminateProcess(runtime.frontend),
			terminateProcess(runtime.backend),
		]);

		delete processes[project.name];
		await wait(500);
	}

	if (project.databaseId) {
		const db = getDatabaseById(project.databaseId);
		if (db && db.containerName) {
			await stopContainer(db.containerName);
		}
	}

	project.status = 'stopped';
	saveProjects(projects);
	console.log(
		`Project ${name} stopped. Remaining projects:`,
		Object.keys(processes),
	);

	return { message: 'Stopped' };
}

module.exports = {
	startProject,
	stopProject,
	processes,
};
