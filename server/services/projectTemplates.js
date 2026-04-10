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

const CLIENT_WORKSPACE_DIRECTORY = 'client';
const LEGACY_FRONTEND_WORKSPACE_DIRECTORY = 'frontend';
const SERVER_WORKSPACE_DIRECTORY = 'server';
const LEGACY_BACKEND_WORKSPACE_DIRECTORY = 'backend';

/**
 * Resolves a frontend template id to its template definition.
 *
 * @param {string | null | undefined} template - Frontend template id stored on the project.
 * @returns {object | null} Template definition, or null when the project has no frontend.
 */
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

/**
 * Resolves a backend template id to its template definition.
 *
 * @param {string | null | undefined} template - Backend template id stored on the project.
 * @returns {object | null} Template definition, or null when the project has no backend.
 */
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

/**
 * Reports whether a template definition requires a dedicated port to run.
 *
 * @param {object | null | undefined} definition - Template definition resolved from the template maps.
 * @returns {boolean} True when the template needs a bound port.
 */
function templateRequiresPort(definition) {
	return Boolean(definition?.requiresPort);
}

/**
 * Reports whether a template represents a managed runtime the dashboard can start and stop.
 *
 * @param {object | null | undefined} definition - Template definition resolved from the template maps.
 * @returns {boolean} True when the dashboard manages the runtime process.
 */
function templateHasManagedService(definition) {
	return Boolean(definition?.managedService);
}

/**
 * Returns the preferred Python shell command for the current platform.
 *
 * @returns {string} Shell command used to run Python in generated presets.
 */
function getPythonShellCommand() {
	return process.platform === 'win32' ? 'py -3' : 'python3';
}

/**
 * Builds a human-readable label for a preset's working directory.
 *
 * @param {string} directory - Stored working directory token.
 * @returns {string} Display label shown in the UI.
 */
function getDirectoryLabel(directory) {
	switch (directory) {
		case CLIENT_WORKSPACE_DIRECTORY:
		case 'frontend':
			return directory;
		case SERVER_WORKSPACE_DIRECTORY:
		case 'backend':
			return directory;
		default:
			return 'project root';
	}
}

/**
 * Resolves the preferred workspace folder while keeping legacy folder names working.
 *
 * @param {string} projectPath - Absolute workspace root.
 * @param {string} preferredDirectory - New default directory name.
 * @param {string} legacyDirectory - Legacy directory name kept for compatibility.
 * @returns {string} Absolute workspace path, preferring the new directory when present.
 */
function resolveWorkspacePath(
	projectPath,
	preferredDirectory,
	legacyDirectory,
) {
	const preferredPath = path.join(projectPath, preferredDirectory);
	if (fs.existsSync(preferredPath)) {
		return preferredPath;
	}

	const legacyPath = path.join(projectPath, legacyDirectory);
	if (fs.existsSync(legacyPath)) {
		return legacyPath;
	}

	return preferredPath;
}

/**
 * Detects the older plain HTML layout that lived directly in the project root.
 *
 * @param {string} projectPath - Absolute workspace root.
 * @returns {boolean} True when the root already contains the static starter files.
 */
function hasRootStaticFrontend(projectPath) {
	return (
		fs.existsSync(path.join(projectPath, 'index.html')) ||
		fs.existsSync(path.join(projectPath, 'serve-static.js'))
	);
}

/**
 * Chooses the folder where backend presets should execute.
 *
 * @param {object} project - Project record used to resolve the workspace path.
 * @param {object | null} backendDefinition - Resolved backend template definition.
 * @returns {string} Relative working directory token used by terminal presets.
 */
function getCommandPresetWorkingDirectory(project, backendDefinition) {
	const projectPath = getProjectPath(project);
	const backendPath = getBackendWorkspacePath(project);

	if (
		backendDefinition?.kind === 'java-console' ||
		backendDefinition?.kind === 'java-maven'
	) {
		return path.relative(projectPath, backendPath) || '';
	}

	return path.relative(projectPath, backendPath) || SERVER_WORKSPACE_DIRECTORY;
}

/**
 * Resolves the absolute workspace path used by the backend template.
 *
 * Console and Maven Java projects can still live at the project root, while
 * managed backends now default to `server` and keep the legacy `backend`
 * directory working for older workspaces.
 *
 * @param {object} project - Project record used to resolve the workspace path.
 * @returns {string} Absolute backend workspace path.
 */
function getBackendWorkspacePath(project) {
	const projectPath = getProjectPath(project);
	const backendDefinition = getBackendTemplateDefinition(project?.backend);
	const backendPath = resolveWorkspacePath(
		projectPath,
		SERVER_WORKSPACE_DIRECTORY,
		LEGACY_BACKEND_WORKSPACE_DIRECTORY,
	);

	if (
		backendDefinition?.kind === 'java-console' ||
		backendDefinition?.kind === 'java-maven'
	) {
		return fs.existsSync(backendPath) ? backendPath : projectPath;
	}

	return backendPath;
}

/**
 * Resolves the absolute workspace path used by the frontend template.
 *
 * Frontend projects now default to a nested `client` folder. Older workspaces
 * may still use a nested `frontend` folder, and older plain HTML projects may
 * still live in the project root. This keeps all three layouts working.
 *
 * @param {object} project - Project record used to resolve the workspace path.
 * @returns {string} Absolute frontend workspace path.
 */
function getFrontendWorkspacePath(project) {
	const projectPath = getProjectPath(project);
	const frontendDefinition = getFrontendTemplateDefinition(project?.frontend);
	const frontendPath = resolveWorkspacePath(
		projectPath,
		CLIENT_WORKSPACE_DIRECTORY,
		LEGACY_FRONTEND_WORKSPACE_DIRECTORY,
	);

	if (frontendDefinition?.kind !== 'static') {
		return frontendPath;
	}

	if (fs.existsSync(frontendPath)) {
		return frontendPath;
	}

	return hasRootStaticFrontend(projectPath) ? projectPath : frontendPath;
}

/**
 * Chooses the folder where frontend presets should execute.
 *
 * @param {object} project - Project record used to resolve the workspace path.
 * @returns {string} Relative working directory token used by terminal presets.
 */
function getFrontendCommandPresetWorkingDirectory(project) {
	const projectPath = getProjectPath(project);
	const frontendPath = getFrontendWorkspacePath(project);
	return path.relative(projectPath, frontendPath) || '';
}

/**
 * Creates a normalized command preset object for the UI and terminal service.
 *
 * @param {{id: string, label: string, description: string, cwd: string, steps: string[], primary?: boolean}} options - Preset metadata and command steps.
 * @returns {{id: string, label: string, description: string, cwd: string, cwdLabel: string, steps: string[], primary: boolean}} Normalized command preset.
 */
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

/**
 * Builds the list of available terminal command presets for a project.
 *
 * @param {object} project - Project record containing template and scaffold information.
 * @returns {Array<object>} Command presets available for the project's selected templates.
 */
function getProjectCommandPresets(project) {
	const presets = [];
	const frontendDefinition = getFrontendTemplateDefinition(project?.frontend);
	const backendDefinition = getBackendTemplateDefinition(project?.backend);
	const scaffold = getProjectScaffold(project);
	const pythonCommand = getPythonShellCommand();
	const backendPort = project?.backendPort || 8000;
	const frontendCwd = getFrontendCommandPresetWorkingDirectory(project);

	if (frontendDefinition?.kind === 'vite') {
		presets.push(
			createCommandPreset({
				id: 'frontend-dev',
				label: 'Run frontend',
				description:
					'Start the frontend dev server in the workspace terminal.',
				cwd: frontendCwd,
				steps: ['npm run dev'],
				primary: !backendDefinition,
			}),
		);
		presets.push(
			createCommandPreset({
				id: 'frontend-build',
				label: 'Build frontend',
				description: 'Create a production frontend build.',
				cwd: frontendCwd,
				steps: ['npm run build'],
			}),
		);
	}

	if (frontendDefinition?.kind === 'static') {
		presets.push(
			createCommandPreset({
				id: 'frontend-preview',
				label: 'Preview static site',
				description:
					'Serve the static frontend files locally from the editor.',
				cwd: frontendCwd,
				steps: ['node serve-static.js'],
				primary: !backendDefinition,
			}),
		);
	}

	if (backendDefinition?.kind === 'node') {
		const backendCwd = getCommandPresetWorkingDirectory(
			project,
			backendDefinition,
		);
		presets.push(
			createCommandPreset({
				id: 'backend-dev',
				label: 'Run backend',
				description:
					'Start the backend development server with reloads.',
				cwd: backendCwd,
				steps: ['npm run dev'],
				primary: true,
			}),
		);
		presets.push(
			createCommandPreset({
				id: 'backend-install',
				label: 'Install backend deps',
				description:
					'Install backend dependencies again inside the project.',
				cwd: backendCwd,
				steps: ['npm install'],
			}),
		);
	}

	if (backendDefinition?.kind === 'python') {
		const backendCwd = getCommandPresetWorkingDirectory(
			project,
			backendDefinition,
		);
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
		const backendCwd = getCommandPresetWorkingDirectory(
			project,
			backendDefinition,
		);
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
		const backendCwd = getCommandPresetWorkingDirectory(
			project,
			backendDefinition,
		);
		presets.push(
			createCommandPreset({
				id: 'backend-run',
				label: 'Run PHP server',
				description:
					'Launch the generated PHP starter with the built-in server.',
				cwd: backendCwd,
				steps: [`php -S 127.0.0.1:${backendPort} -t .`],
				primary: true,
			}),
		);
	}

	if (backendDefinition?.kind === 'java') {
		const backendCwd = getCommandPresetWorkingDirectory(
			project,
			backendDefinition,
		);
		const javaSourcePath = getJavaSourceRelativePath(scaffold);
		const javaMainClass = getJavaQualifiedMainClass(scaffold);
		presets.push(
			createCommandPreset({
				id: 'backend-run',
				label: 'Run Java server',
				description:
					'Compile the generated Java sources and launch the HTTP server.',
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
		const backendCwd = getCommandPresetWorkingDirectory(
			project,
			backendDefinition,
		);
		const javaSourcePath = getJavaSourceRelativePath(scaffold);
		const javaMainClass = getJavaQualifiedMainClass(scaffold);
		presets.push(
			createCommandPreset({
				id: 'backend-build',
				label: 'Compile Java app',
				description:
					'Compile the Java console application into the out folder.',
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
		const backendCwd = getCommandPresetWorkingDirectory(
			project,
			backendDefinition,
		);
		presets.push(
			createCommandPreset({
				id: 'backend-run',
				label: 'Run Maven app',
				description:
					'Use Maven to execute the generated Java application.',
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

/**
 * Returns the preferred preset id for a project, falling back to the first preset when needed.
 *
 * @param {object} project - Project record used to derive command presets.
 * @returns {string | null} Primary preset id, or null when no presets are available.
 */
function getPrimaryProjectCommandPresetId(project) {
	const presets = getProjectCommandPresets(project);
	return (
		presets.find((preset) => preset.primary)?.id || presets[0]?.id || null
	);
}

module.exports = {
	FRONTEND_TEMPLATE_DEFINITIONS,
	BACKEND_TEMPLATE_DEFINITIONS,
	getFrontendTemplateDefinition,
	getBackendTemplateDefinition,
	templateRequiresPort,
	templateHasManagedService,
	getBackendWorkspacePath,
	getFrontendWorkspacePath,
	getFrontendCommandPresetWorkingDirectory,
	getProjectCommandPresets,
	getPrimaryProjectCommandPresetId,
};
