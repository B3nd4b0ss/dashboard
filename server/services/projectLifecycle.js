const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const kill = require('tree-kill');
const { loadProjects, saveProjects } = require('../utils/fileOperations');
const { findProject } = require('../utils/helpers');
const { getProjectPath } = require('../utils/projectPaths');
const {
	startContainer,
	stopContainer,
	getContainerStatus,
} = require('./docker');
const { getDatabaseById } = require('./databaseService');
const { assertPortAvailable } = require('./portRegistry');
const {
	appendRuntimeLogEvent,
	createRuntimeLogSession,
} = require('./projectLogService');
const {
	processes,
	isChildProcessAlive,
	pruneRuntimeRegistry,
	getRunningServices,
	getProjectRuntimeSnapshot,
} = require('./runtimeRegistry');
const {
	recordServiceLaunch,
	recordServiceStopRequest,
	recordServiceExit,
} = require('./projectMonitoringService');
const {
	getFrontendTemplateDefinition,
	getBackendTemplateDefinition,
	templateHasManagedService,
} = require('./projectTemplates');
const {
	getJavaQualifiedMainClass,
	getJavaSourceRelativePath,
	getProjectScaffold,
} = require('./projectScaffold');
const { configureProcessToolEnvironment } = require('./developmentToolchain');

configureProcessToolEnvironment();

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function commandExists(command, args = ['--version']) {
	const result = spawnSync(command, args, {
		stdio: 'ignore',
		windowsHide: true,
	});

	return !result.error;
}

function resolveAvailableCommand(candidates, runtimeLabel) {
	for (const candidate of candidates) {
		if (commandExists(candidate.command, candidate.probeArgs)) {
			return {
				command: candidate.command,
				args: candidate.args || [],
			};
		}
	}

	throw new Error(
		`${runtimeLabel} runtime is not available on this machine. Install it and try again.`,
	);
}

function resolvePythonCommand() {
	if (process.platform === 'win32') {
		return resolveAvailableCommand(
			[
				{ command: 'py', args: ['-3'], probeArgs: ['-3', '--version'] },
				{ command: 'python', probeArgs: ['--version'] },
				{ command: 'python3', probeArgs: ['--version'] },
			],
			'Python',
		);
	}

	return resolveAvailableCommand(
		[
			{ command: 'python3', probeArgs: ['--version'] },
			{ command: 'python', probeArgs: ['--version'] },
		],
		'Python',
	);
}

function resolvePhpCommand() {
	return resolveAvailableCommand(
		[{ command: 'php', probeArgs: ['-v'] }],
		'PHP',
	);
}

function resolveJavaCommands() {
	return {
		java: resolveAvailableCommand(
			[{ command: 'java', probeArgs: ['-version'] }],
			'Java',
		),
		javac: resolveAvailableCommand(
			[{ command: 'javac', probeArgs: ['-version'] }],
			'Java compiler',
		),
	};
}

function pipeSetupOutput(projectName, serviceName, proc, logSession) {
	const prefix = `[${projectName}:${serviceName}:setup] `;

	if (proc.stdout) {
		proc.stdout.on('data', (chunk) => {
			process.stdout.write(prefix + chunk.toString());
			logSession?.writeOutput('stdout', chunk);
		});
	}

	if (proc.stderr) {
		proc.stderr.on('data', (chunk) => {
			process.stderr.write(prefix + chunk.toString());
			logSession?.writeOutput('stderr', chunk);
		});
	}
}

function runPreparationCommand(
	command,
	args,
	{ cwd, env, logSession, projectName, serviceName, description },
) {
	return new Promise((resolve, reject) => {
		logSession?.writeEvent(description);

		const proc = spawn(command, args, {
			cwd,
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
		});

		pipeSetupOutput(projectName, serviceName, proc, logSession);

		proc.on('close', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`${description} failed with code ${code}.`));
		});
		proc.on('error', reject);
	});
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

function attachProcessListeners(projectName, serviceName, proc, logSession) {
	proc.on('error', (error) => {
		if (!proc.__dashboardMonitoringExitRecorded) {
			proc.__dashboardMonitoringExitRecorded = true;
		}
		recordServiceExit(projectName, serviceName, {
			expected: false,
			pid: proc.pid,
			errorMessage: error.message,
		});
		logSession?.writeEvent(
			`Failed to start ${serviceName}: ${error.message}`,
			'error',
		);
		logSession?.close(`Startup for ${serviceName} did not complete.`);

		console.error(
			`Failed to start ${serviceName} for ${projectName}:`,
			error.message,
		);
		clearTrackedService(projectName, serviceName);
		updatePersistedProjectStatus(projectName);
	});

	proc.on('exit', (code, signal) => {
		if (!proc.__dashboardMonitoringExitRecorded) {
			proc.__dashboardMonitoringExitRecorded = true;
			recordServiceExit(projectName, serviceName, {
				code,
				signal,
				expected: Boolean(proc.__dashboardStopping),
				pid: proc.pid,
			});
		}
		let finalLogMessage = `${serviceName} exited cleanly.`;

		if (proc.__dashboardStopping) {
			finalLogMessage = `${serviceName} stopped by dashboard request.`;
		} else if (code !== 0 && code !== null) {
			finalLogMessage = `${serviceName} exited unexpectedly with code ${code}.`;
		} else if (signal && signal !== 'SIGTERM') {
			finalLogMessage = `${serviceName} exited unexpectedly with signal ${signal}.`;
		}

		logSession?.close(finalLogMessage);
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

function pipeProcessOutput(projectName, serviceName, proc, logSession) {
	const prefix = `[${projectName}:${serviceName}] `;

	if (proc.stdout) {
		proc.stdout.on('data', (chunk) => {
			process.stdout.write(prefix + chunk.toString());
			logSession?.writeOutput('stdout', chunk);
		});
	}

	if (proc.stderr) {
		proc.stderr.on('data', (chunk) => {
			process.stderr.write(prefix + chunk.toString());
			logSession?.writeOutput('stderr', chunk);
		});
	}
}

function getValidatedServicePath(projectPath, projectName, serviceName) {
	const servicePath = path.join(projectPath, serviceName);

	if (!fs.existsSync(servicePath)) {
		throw new Error(
			`${serviceName} workspace not found for ${projectName}. Expected ${servicePath}`,
		);
	}

	return servicePath;
}

function resolveServiceCommand(project, servicePath, serviceName) {
	if (serviceName === 'frontend') {
		const templateDefinition = getFrontendTemplateDefinition(project.frontend);
		if (templateDefinition?.kind === 'vite') {
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
				args: [viteBin, '--port', String(project.frontendPort)],
			};
		}

		if (templateDefinition?.kind === 'static') {
			const serverEntry = path.join(servicePath, 'serve-static.js');
			if (!fs.existsSync(serverEntry)) {
				throw new Error(
					`Static frontend server not found for ${project.name}. Expected ${serverEntry}`,
				);
			}

			return {
				command: process.execPath,
				args: [serverEntry],
			};
		}
	}

	if (serviceName === 'backend') {
		const templateDefinition = getBackendTemplateDefinition(project.backend);

		if (templateDefinition?.kind === 'node') {
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

		if (templateDefinition?.kind === 'python') {
			const pythonEntry = path.join(servicePath, 'app.py');
			const pythonCommand = resolvePythonCommand();

			if (!fs.existsSync(pythonEntry)) {
				throw new Error(
					`Python entry file not found for ${project.name}. Expected ${pythonEntry}`,
				);
			}

			return {
				command: pythonCommand.command,
				args: [...pythonCommand.args, '-u', 'app.py'],
			};
		}

		if (templateDefinition?.kind === 'php') {
			const phpEntry = path.join(servicePath, 'index.php');
			const phpCommand = resolvePhpCommand();

			if (!fs.existsSync(phpEntry)) {
				throw new Error(
					`PHP entry file not found for ${project.name}. Expected ${phpEntry}`,
				);
			}

			return {
				command: phpCommand.command,
				args: [
					...phpCommand.args,
					'-S',
					`127.0.0.1:${project.backendPort}`,
					'-t',
					'.',
				],
			};
		}

		if (templateDefinition?.kind === 'java') {
			const scaffold = getProjectScaffold(project);
			const javaEntry = path.join(
				servicePath,
				getJavaSourceRelativePath(scaffold),
			);
			const javaCommands = resolveJavaCommands();

			if (!fs.existsSync(javaEntry)) {
				throw new Error(
					`Java entry file not found for ${project.name}. Expected ${javaEntry}`,
				);
			}

			return {
				command: javaCommands.java.command,
				args: [
					...javaCommands.java.args,
					'-cp',
					'out',
					getJavaQualifiedMainClass(scaffold),
				],
				prepare: ({ logSession, env }) =>
					runPreparationCommand(
						javaCommands.javac.command,
						[
							...javaCommands.javac.args,
							'--release',
							scaffold.javaVersion,
							'-d',
							'out',
							getJavaSourceRelativePath(scaffold),
						],
						{
							cwd: servicePath,
							env,
							logSession,
							projectName: project.name,
							serviceName,
							description: 'Compiling Java sources',
						},
					),
			};
		}
	}

	throw new Error(
		`Unsupported ${serviceName} runtime for ${project.name}: ${project[serviceName] || 'unknown'}`,
	);
}

async function spawnProjectService(servicePath, project, serviceName) {
	const expectedPort =
		serviceName === 'backend' ? project.backendPort : project.frontendPort;
	const env = { ...process.env, PORT: String(expectedPort) };
	const { command, args, prepare } = resolveServiceCommand(
		project,
		servicePath,
		serviceName,
	);
	const logSession = createRuntimeLogSession(project.name, serviceName, {
		cwd: servicePath,
		command,
		args,
		port: expectedPort,
	});

	try {
		if (prepare) {
			await prepare({ logSession, env });
		}

		const proc = spawn(command, args, {
			cwd: servicePath,
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
			env,
		});

		proc.__dashboardProjectName = project.name;
		proc.__dashboardServiceName = serviceName;
		proc.__dashboardLogSession = logSession;
		recordServiceLaunch(project.name, serviceName, proc);

		pipeProcessOutput(project.name, serviceName, proc, logSession);
		attachProcessListeners(project.name, serviceName, proc, logSession);
		return proc;
	} catch (error) {
		logSession.close(`Failed to spawn ${serviceName}: ${error.message}`);
		throw error;
	}
}

function terminateProcess(proc) {
	return new Promise((resolve) => {
		if (!proc || !proc.pid) {
			resolve();
			return;
		}

		proc.__dashboardStopping = true;
		if (proc.__dashboardProjectName && proc.__dashboardServiceName) {
			recordServiceStopRequest(
				proc.__dashboardProjectName,
				proc.__dashboardServiceName,
			);
		}
		if (proc.__dashboardProjectName && proc.__dashboardServiceName) {
			appendRuntimeLogEvent(
				proc.__dashboardProjectName,
				proc.__dashboardServiceName,
				'Dashboard requested service stop.',
			);
		}
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

	const projectPath = getProjectPath(project);
	const runtime = processes[project.name] || {};
	const servicePaths = {};
	const servicesToStart = [];
	const frontendManaged = templateHasManagedService(
		getFrontendTemplateDefinition(project.frontend),
	);
	const backendManaged = templateHasManagedService(
		getBackendTemplateDefinition(project.backend),
	);

	if (frontendManaged && !isChildProcessAlive(runtime.frontend)) {
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

	if (backendManaged && !isChildProcessAlive(runtime.backend)) {
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
	const startedServices = [];

	try {
		for (const serviceName of servicesToStart) {
			runtime[serviceName] = await spawnProjectService(
				servicePaths[serviceName],
				project,
				serviceName,
			);
			startedServices.push(serviceName);
		}
	} catch (error) {
		await Promise.all(
			startedServices.map((serviceName) =>
				terminateProcess(runtime[serviceName]),
			),
		);
		delete processes[project.name];
		updatePersistedProjectStatus(project.name);
		throw error;
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
