const fs = require('fs');
const path = require('path');
const {
	getJavaQualifiedMainClass,
	getJavaSourceRelativePath,
	getProjectScaffold,
} = require('./projectScaffold');
const { getProjectPath } = require('../utils/projectPaths');

const FRONTEND_TEMPLATE_DEFINITIONS = Object.freeze({
	'vite-react': {
		label: 'Vite + React',
		kind: 'vite',
		viteTemplate: 'react',
		managedService: true,
		requiresPort: true,
	},
	'vite-vanilla': {
		label: 'Vite + Vanilla JS',
		kind: 'vite',
		viteTemplate: 'vanilla',
		managedService: true,
		requiresPort: true,
	},
	'vite-react-ts': {
		label: 'Vite + React TS',
		kind: 'vite',
		viteTemplate: 'react-ts',
		managedService: true,
		requiresPort: true,
	},
	'vite-vue': {
		label: 'Vite + Vue',
		kind: 'vite',
		viteTemplate: 'vue',
		managedService: true,
		requiresPort: true,
	},
	'vite-vanilla-ts': {
		label: 'Vite + Vanilla TS',
		kind: 'vite',
		viteTemplate: 'vanilla-ts',
		managedService: true,
		requiresPort: true,
	},
	'plain-html': {
		label: 'HTML + CSS + JS',
		kind: 'static',
		managedService: true,
		requiresPort: true,
	},
});

const BACKEND_TEMPLATE_DEFINITIONS = Object.freeze({
	node: {
		label: 'Node + Express',
		kind: 'node',
		framework: 'express',
		managedService: true,
		requiresPort: true,
	},
	fastify: {
		label: 'Node + Fastify',
		kind: 'node',
		framework: 'fastify',
		managedService: true,
		requiresPort: true,
	},
	koa: {
		label: 'Node + Koa',
		kind: 'node',
		framework: 'koa',
		managedService: true,
		requiresPort: true,
	},
	python: {
		label: 'Python HTTP Server',
		kind: 'python',
		managedService: true,
		requiresPort: true,
	},
	'python-cli': {
		label: 'Python CLI App',
		kind: 'python-cli',
		managedService: false,
		requiresPort: false,
	},
	php: {
		label: 'PHP Built-in Server',
		kind: 'php',
		managedService: true,
		requiresPort: true,
	},
	java: {
		label: 'Java HTTP Server',
		kind: 'java',
		managedService: true,
		requiresPort: true,
	},
	'java-console': {
		label: 'Java Console App',
		kind: 'java-console',
		managedService: false,
		requiresPort: false,
	},
	'java-maven': {
		label: 'Java + Maven App',
		kind: 'java-maven',
		managedService: false,
		requiresPort: false,
	},
});

function getFrontendTemplateDefinition(template) {
	if (!template) {
		return null;
	}

	const definition = FRONTEND_TEMPLATE_DEFINITIONS[template];
	if (!definition) {
		throw new Error(`Unsupported frontend template: ${template}`);
	}

	return definition;
}

function getBackendTemplateDefinition(template) {
	if (!template) {
		return null;
	}

	const definition = BACKEND_TEMPLATE_DEFINITIONS[template];
	if (!definition) {
		throw new Error(`Unsupported backend template: ${template}`);
	}

	return definition;
}

function templateRequiresPort(definition) {
	return Boolean(definition?.requiresPort);
}

function templateHasManagedService(definition) {
	return Boolean(definition?.managedService);
}

function getPythonShellCommand() {
	return process.platform === 'win32' ? 'py -3' : 'python3';
}

function getDirectoryLabel(directory) {
	switch (directory) {
		case 'frontend':
			return 'frontend';
		case 'backend':
			return 'backend';
		default:
			return 'project root';
	}
}

function getCommandPresetWorkingDirectory(project, backendDefinition) {
	if (
		backendDefinition?.kind !== 'java-console' &&
		backendDefinition?.kind !== 'java-maven'
	) {
		return 'backend';
	}

	const projectPath = getProjectPath(project);
	return fs.existsSync(path.join(projectPath, 'backend')) ? 'backend' : '';
}

function createCommandPreset({
	id,
	label,
	description,
	cwd,
	steps,
	primary = false,
}) {
	return {
		id,
		label,
		description,
		cwd,
		cwdLabel: getDirectoryLabel(cwd),
		steps,
		primary,
	};
}

function getProjectCommandPresets(project) {
	const presets = [];
	const frontendDefinition = getFrontendTemplateDefinition(project?.frontend);
	const backendDefinition = getBackendTemplateDefinition(project?.backend);
	const scaffold = getProjectScaffold(project);
	const pythonCommand = getPythonShellCommand();
	const backendPort = project?.backendPort || 8000;

	if (frontendDefinition?.kind === 'vite') {
		presets.push(
			createCommandPreset({
				id: 'frontend-dev',
				label: 'Run frontend',
				description: 'Start the frontend dev server in the workspace terminal.',
				cwd: 'frontend',
				steps: ['npm run dev'],
				primary: !backendDefinition,
			}),
		);
		presets.push(
			createCommandPreset({
				id: 'frontend-build',
				label: 'Build frontend',
				description: 'Create a production frontend build.',
				cwd: 'frontend',
				steps: ['npm run build'],
			}),
		);
	}

	if (frontendDefinition?.kind === 'static') {
		presets.push(
			createCommandPreset({
				id: 'frontend-preview',
				label: 'Preview static site',
				description: 'Serve the static frontend files locally from the editor.',
				cwd: 'frontend',
				steps: ['node serve-static.js'],
				primary: !backendDefinition,
			}),
		);
	}

	if (backendDefinition?.kind === 'node') {
		const backendCwd = getCommandPresetWorkingDirectory(project, backendDefinition);
		presets.push(
			createCommandPreset({
				id: 'backend-dev',
				label: 'Run backend',
				description: 'Start the backend development server with reloads.',
				cwd: backendCwd,
				steps: ['npm run dev'],
				primary: true,
			}),
		);
		presets.push(
			createCommandPreset({
				id: 'backend-install',
				label: 'Install backend deps',
				description: 'Install backend dependencies again inside the project.',
				cwd: backendCwd,
				steps: ['npm install'],
			}),
		);
	}

	if (backendDefinition?.kind === 'python') {
		const backendCwd = getCommandPresetWorkingDirectory(project, backendDefinition);
		presets.push(
			createCommandPreset({
				id: 'backend-run',
				label: 'Run Python server',
				description: 'Start the generated Python HTTP server.',
				cwd: backendCwd,
				steps: [`${pythonCommand} app.py`],
				primary: true,
			}),
		);
	}

	if (backendDefinition?.kind === 'python-cli') {
		const backendCwd = getCommandPresetWorkingDirectory(project, backendDefinition);
		presets.push(
			createCommandPreset({
				id: 'backend-run',
				label: 'Run Python app',
				description: 'Execute the Python application entrypoint.',
				cwd: backendCwd,
				steps: [`${pythonCommand} -m app`],
				primary: true,
			}),
		);
		presets.push(
			createCommandPreset({
				id: 'backend-test',
				label: 'Run Python tests',
				description: 'Run the bundled Python smoke tests.',
				cwd: backendCwd,
				steps: [`${pythonCommand} -m unittest discover tests`],
			}),
		);
	}

	if (backendDefinition?.kind === 'php') {
		const backendCwd = getCommandPresetWorkingDirectory(project, backendDefinition);
		presets.push(
			createCommandPreset({
				id: 'backend-run',
				label: 'Run PHP server',
				description: 'Launch the generated PHP starter with the built-in server.',
				cwd: backendCwd,
				steps: [`php -S 127.0.0.1:${backendPort} -t .`],
				primary: true,
			}),
		);
	}

	if (backendDefinition?.kind === 'java') {
		const backendCwd = getCommandPresetWorkingDirectory(project, backendDefinition);
		const javaSourcePath = getJavaSourceRelativePath(scaffold);
		const javaMainClass = getJavaQualifiedMainClass(scaffold);
		presets.push(
			createCommandPreset({
				id: 'backend-run',
				label: 'Run Java server',
				description: 'Compile the generated Java sources and launch the HTTP server.',
				cwd: backendCwd,
				steps: [
					`javac --release ${scaffold.javaVersion} -d out ${javaSourcePath}`,
					`java -cp out ${javaMainClass}`,
				],
				primary: true,
			}),
		);
	}

	if (backendDefinition?.kind === 'java-console') {
		const backendCwd = getCommandPresetWorkingDirectory(project, backendDefinition);
		const javaSourcePath = getJavaSourceRelativePath(scaffold);
		const javaMainClass = getJavaQualifiedMainClass(scaffold);
		presets.push(
			createCommandPreset({
				id: 'backend-build',
				label: 'Compile Java app',
				description: 'Compile the Java console application into the out folder.',
				cwd: backendCwd,
				steps: [
					`javac --release ${scaffold.javaVersion} -d out ${javaSourcePath}`,
				],
			}),
		);
		presets.push(
			createCommandPreset({
				id: 'backend-run',
				label: 'Run Java app',
				description: 'Compile and run the Java console application.',
				cwd: backendCwd,
				steps: [
					`javac --release ${scaffold.javaVersion} -d out ${javaSourcePath}`,
					`java -cp out ${javaMainClass}`,
				],
				primary: true,
			}),
		);
	}

	if (backendDefinition?.kind === 'java-maven') {
		const backendCwd = getCommandPresetWorkingDirectory(project, backendDefinition);
		presets.push(
			createCommandPreset({
				id: 'backend-run',
				label: 'Run Maven app',
				description: 'Use Maven to execute the generated Java application.',
				cwd: backendCwd,
				steps: ['mvn exec:java'],
				primary: true,
			}),
		);
		presets.push(
			createCommandPreset({
				id: 'backend-build',
				label: 'Build Maven app',
				description: 'Compile and package the Maven application.',
				cwd: backendCwd,
				steps: ['mvn package'],
			}),
		);
		presets.push(
			createCommandPreset({
				id: 'backend-test',
				label: 'Run Maven tests',
				description: 'Execute the Maven test lifecycle.',
				cwd: backendCwd,
				steps: ['mvn test'],
			}),
		);
	}

	return presets;
}

function getPrimaryProjectCommandPresetId(project) {
	const presets = getProjectCommandPresets(project);
	return presets.find((preset) => preset.primary)?.id || presets[0]?.id || null;
}

module.exports = {
	FRONTEND_TEMPLATE_DEFINITIONS,
	BACKEND_TEMPLATE_DEFINITIONS,
	getFrontendTemplateDefinition,
	getBackendTemplateDefinition,
	templateRequiresPort,
	templateHasManagedService,
	getProjectCommandPresets,
	getPrimaryProjectCommandPresetId,
};
