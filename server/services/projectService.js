const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const { loadProjects, saveProjects } = require('../utils/fileOperations');
const { findProject } = require('../utils/helpers');
const { getDatabaseById } = require('./databaseService');
const {
	processes,
	getRunningServices,
	getProjectRuntimeSnapshot,
} = require('./runtimeRegistry');
const { startProject, stopProject } = require('./projectLifecycle');
const { assertPortAvailable, normalizePort } = require('./portRegistry');
const {
	getProjectTaskSummary,
	getProjectTaskSummaryMap,
	renameProjectTasks,
	deleteTasksForProject,
} = require('./taskService');
const {
	getProjectMonitoringMap,
	createProjectMonitoringSnapshot,
	invalidateProjectWorkspaceMetrics,
	renameProjectMonitoringState,
	clearProjectMonitoringState,
} = require('./projectMonitoringService');
const {
	getFrontendTemplateDefinition,
	getBackendTemplateDefinition,
	templateRequiresPort,
	templateHasManagedService,
	getProjectCommandPresets,
	getPrimaryProjectCommandPresetId,
} = require('./projectTemplates');
const {
	getJavaQualifiedMainClass,
	getJavaSourceRelativePath,
	getProjectScaffold,
	resolveProjectScaffold,
} = require('./projectScaffold');
const {
	initializeProjectRepository,
	deleteProjectRepository,
	publishProjectRepository,
} = require('./projectRepositoryService');
const {
	buildProjectPath,
	getProjectLocation,
	getProjectPath,
	isPathInside,
	pathsEqual,
} = require('../utils/projectPaths');

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
const WINDOWS_NPM_CLI =
	process.platform === 'win32' && path.isAbsolute(NPM_COMMAND)
		? path.join(
				path.dirname(NPM_COMMAND),
				'node_modules',
				'npm',
				'bin',
				'npm-cli.js',
			)
		: null;

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
 * Spawns a child process without opening a visible Windows console window.
 *
 * @param {string} command - Executable to run.
 * @param {string[]} args - Arguments passed to the executable.
 * @param {object} [options={}] - Additional spawn options.
 * @returns {import('child_process').ChildProcess} Spawned child process.
 */
function spawnHidden(command, args, options = {}) {
	return spawn(command, args, {
		shell: false,
		windowsHide: true,
		...options,
	});
}

/**
 * Spawns npm using the most reliable launcher for the current platform.
 *
 * @param {string[]} args - npm arguments without the base executable.
 * @param {object} [options={}] - Additional spawn options.
 * @returns {import('child_process').ChildProcess} Spawned npm process.
 */
function spawnNpm(args, options = {}) {
	if (process.platform === 'win32' && WINDOWS_NPM_CLI) {
		return spawnHidden(
			process.execPath,
			[WINDOWS_NPM_CLI, ...args],
			options,
		);
	}

	if (process.platform === 'win32') {
		const invocation = [
			quoteForCmd(NPM_COMMAND),
			...args.map(quoteForCmd),
		].join(' ');
		return spawnHidden(
			COMMAND_SHELL,
			['/d', '/s', '/c', `"${invocation}"`],
			options,
		);
	}

	return spawnHidden(NPM_COMMAND, args, options);
}

/**
 * Removes persisted metadata and files after a partially failed project creation.
 *
 * @param {string} projectName - Project name that was being created.
 * @param {string} projectPath - Absolute workspace path that should be removed.
 * @returns {Promise<void>}
 */
async function cleanupFailedProjectCreation(projectName, projectPath) {
	const remainingProjects = loadProjects().filter(
		(project) => project.name.toLowerCase() !== projectName.toLowerCase(),
	);
	saveProjects(remainingProjects);

	if (await fs.pathExists(projectPath)) {
		await fs.remove(projectPath);
	}
}

/**
 * Enriches a stored project record with runtime, monitoring, task, and command metadata.
 *
 * @param {object} project - Persisted project record.
 * @param {Map<string, object> | null} [taskSummaryMap=null] - Optional precomputed task summaries keyed by project name.
 * @param {object | null} [runtimeSnapshot=null] - Optional precomputed runtime snapshot.
 * @param {Map<string, object> | null} [monitoringMap=null] - Optional monitoring snapshots keyed by project name.
 * @returns {object} Decorated project payload returned by the API.
 */
function decorateProject(
	project,
	taskSummaryMap = null,
	runtimeSnapshot = null,
	monitoringMap = null,
) {
	const result = { ...project };

	if (project.databaseId) {
		const db = getDatabaseById(project.databaseId);
		if (db) {
			result.database = db;
		}
	}

	const runtime = runtimeSnapshot || getProjectRuntimeSnapshot(project);
	result.runtime = runtime;
	result.status = runtime.status;
	result.frontendUrl = runtime.services.frontend?.url || null;
	result.backendUrl = runtime.services.backend?.url || null;
	result.projectPath = getProjectPath(project);
	result.projectLocation = getProjectLocation(project);
	result.monitoring =
		monitoringMap?.get(project.name.toLowerCase()) ||
		createProjectMonitoringSnapshot(project, runtime);
	result.taskSummary =
		taskSummaryMap?.get(project.name.toLowerCase()) ||
		getProjectTaskSummary(project.name);
	result.commandPresets = getProjectCommandPresets(project);
	result.primaryCommandPresetId = getPrimaryProjectCommandPresetId(project);
	result.hasManagedServices = runtime.expectedServiceCount > 0;

	return result;
}

/**
 * Normalizes the frontend and backend ports required by a template selection.
 *
 * @param {{frontend?: string | null, backend?: string | null, frontendPort?: string | number | null, backendPort?: string | number | null}} options - Template and port inputs from the client.
 * @returns {{frontendPort: number | null, backendPort: number | null}} Normalized ports for the selected templates.
 */
function resolveProjectPorts({ frontend, backend, frontendPort, backendPort }) {
	const frontendDefinition = getFrontendTemplateDefinition(frontend);
	const backendDefinition = getBackendTemplateDefinition(backend);
	const resolvedFrontendPort = templateRequiresPort(frontendDefinition)
		? normalizePort(frontendPort, 'Frontend port')
		: null;
	const resolvedBackendPort = templateRequiresPort(backendDefinition)
		? normalizePort(backendPort, 'Backend port')
		: null;

	if (
		templateRequiresPort(frontendDefinition) &&
		templateRequiresPort(backendDefinition) &&
		resolvedFrontendPort === resolvedBackendPort
	) {
		throw new Error('Frontend and backend ports must be different');
	}

	return {
		frontendPort: resolvedFrontendPort,
		backendPort: resolvedBackendPort,
	};
}

/**
 * Validates project ports against current system usage and persisted assignments.
 *
 * @param {{frontend?: string | null, backend?: string | null, frontendPort?: string | number | null, backendPort?: string | number | null, excludeProjectName?: string | null, currentFrontendPort?: number | null, currentBackendPort?: number | null}} options - Template, port, and exclusion inputs.
 * @returns {{frontendPort: number | null, backendPort: number | null}} Validated ports for the selected templates.
 */
function validateProjectPorts({
	frontend,
	backend,
	frontendPort,
	backendPort,
	excludeProjectName = null,
	currentFrontendPort = null,
	currentBackendPort = null,
}) {
	const resolvedPorts = resolveProjectPorts({
		frontend,
		backend,
		frontendPort,
		backendPort,
	});

	if (
		resolvedPorts.frontendPort !== null &&
		resolvedPorts.frontendPort !== currentFrontendPort
	) {
		assertPortAvailable(resolvedPorts.frontendPort, {
			label: 'Frontend port',
			excludeProjectName,
		});
	}

	if (
		resolvedPorts.backendPort !== null &&
		resolvedPorts.backendPort !== currentBackendPort
	) {
		assertPortAvailable(resolvedPorts.backendPort, {
			label: 'Backend port',
			excludeProjectName,
		});
	}

	return resolvedPorts;
}

function ensureSupportedProjectTemplates({ frontend, backend }) {
	getFrontendTemplateDefinition(frontend);
	getBackendTemplateDefinition(backend);
}

// ---------- Basic Project Operations ----------
/**
 * Returns every project decorated with runtime, monitoring, and task summary data.
 *
 * @returns {Promise<object[]>} Decorated project records.
 */
async function getAllProjects() {
	const projects = loadProjects();
	const taskSummaryMap = getProjectTaskSummaryMap();
	const runtimeSnapshotMap = new Map(
		projects.map((project) => [
			project.name.toLowerCase(),
			getProjectRuntimeSnapshot(project),
		]),
	);
	const monitoringMap = await getProjectMonitoringMap(
		projects,
		runtimeSnapshotMap,
	);

	return projects.map((project) =>
		decorateProject(
			project,
			taskSummaryMap,
			runtimeSnapshotMap.get(project.name.toLowerCase()),
			monitoringMap,
		),
	);
}

/**
 * Returns one decorated project by name.
 *
 * @param {string} name - Project name to load.
 * @returns {Promise<object | null>} Decorated project record, or null when the project does not exist.
 */
async function getProject(name) {
	const projects = loadProjects();
	const project = findProject(projects, name);
	if (!project) return null;
	const runtimeSnapshot = getProjectRuntimeSnapshot(project);
	const monitoringMap = await getProjectMonitoringMap(
		[project],
		new Map([[project.name.toLowerCase(), runtimeSnapshot]]),
	);
	return decorateProject(project, null, runtimeSnapshot, monitoringMap);
}

/**
 * Creates a new project workspace, scaffolds the selected templates, and initializes its repository metadata.
 *
 * @param {{name: string, frontend?: string | null, backend?: string | null, databaseId?: string | null, frontendPort?: string | number | null, backendPort?: string | number | null, projectLocation?: string, autoCreateRepo?: boolean, visibility?: 'public' | 'private'}} data - Project creation payload from the client.
 * @returns {Promise<object>} Newly created project record.
 */
async function createProject(data) {
	const {
		name,
		frontend,
		backend,
		databaseId,
		frontendPort,
		backendPort,
		projectLocation,
		autoCreateRepo,
		visibility,
	} = data;
	const projects = loadProjects();
	const trimmedName = String(name || '').trim();

	if (!trimmedName) {
		throw new Error('Project name is required');
	}

	if (findProject(projects, trimmedName)) {
		throw new Error('Name exists');
	}

	// Validate database if provided
	let linkedDatabase = null;
	if (databaseId) {
		linkedDatabase = getDatabaseById(databaseId);
		if (!linkedDatabase) {
			throw new Error('Database not found');
		}
	}

	ensureSupportedProjectTemplates({ frontend, backend });

	const resolvedPorts = validateProjectPorts({
		frontend,
		backend,
		frontendPort,
		backendPort,
	});
	const scaffold = resolveProjectScaffold({
		...data,
		name: trimmedName,
		frontend,
		backend,
	});
	const projectPath = buildProjectPath(trimmedName, projectLocation);

	if (await fs.pathExists(projectPath)) {
		throw new Error('Project folder already exists');
	}

	const newProject = {
		name: trimmedName,
		frontend: frontend || null,
		backend: backend || null,
		databaseId: linkedDatabase ? linkedDatabase.id : null,
		frontendPort: resolvedPorts.frontendPort,
		backendPort: resolvedPorts.backendPort,
		projectPath,
		scaffold,
		status: 'stopped',
	};

	projects.push(newProject);
	saveProjects(projects);

	try {
		await fs.mkdirp(projectPath);

		if (frontend) {
			await createFrontend(projectPath, trimmedName, frontend, scaffold);
		}

		if (backend) {
			await createBackend(
				projectPath,
				trimmedName,
				resolvedPorts.backendPort,
				backend,
				linkedDatabase,
				scaffold,
			);
		}
	} catch (error) {
		await cleanupFailedProjectCreation(trimmedName, projectPath);
		throw error;
	}

	newProject.repository = await initializeProjectRepository(newProject, {
		autoCreateRepo,
		projectPath,
		visibility,
	});
	saveProjects(projects);

	return newProject;
}

// ---------- Streaming Project Creation ----------
async function createProjectWithStream(data, eventEmitter) {
	const {
		name,
		frontend,
		backend,
		databaseId,
		frontendPort,
		backendPort,
		projectLocation,
	} = data;
	const projects = loadProjects();
	const trimmedName = String(name || '').trim();

	if (!trimmedName) {
		eventEmitter.emit('error', 'Project name is required');
		throw new Error('Project name is required');
	}

	if (findProject(projects, trimmedName)) {
		eventEmitter.emit('error', 'Project name already exists');
		throw new Error('Name exists');
	}

	// Validate database if provided
	let linkedDatabase = null;
	if (databaseId) {
		linkedDatabase = getDatabaseById(databaseId);
		if (!linkedDatabase) {
			eventEmitter.emit('error', 'Database not found');
			throw new Error('Database not found');
		}
	}

	let resolvedPorts;
	try {
		resolvedPorts = validateProjectPorts({
			frontend,
			backend,
			frontendPort,
			backendPort,
		});
	} catch (error) {
		eventEmitter.emit('error', error.message);
		throw error;
	}

	eventEmitter.emit('log', `🚀 Creating project: ${name}`);

	const scaffold = resolveProjectScaffold({
		...data,
		name: trimmedName,
		frontend,
		backend,
	});
	const projectPath = buildProjectPath(trimmedName, projectLocation);

	if (await fs.pathExists(projectPath)) {
		eventEmitter.emit('error', 'Project folder already exists');
		throw new Error('Project folder already exists');
	}

	const newProject = {
		name: trimmedName,
		frontend: frontend || null,
		backend: backend || null,
		databaseId: linkedDatabase ? linkedDatabase.id : null,
		frontendPort: resolvedPorts.frontendPort,
		backendPort: resolvedPorts.backendPort,
		projectPath,
		scaffold,
		status: 'stopped',
	};

	projects.push(newProject);
	saveProjects(projects);

	await fs.mkdirp(projectPath);
	eventEmitter.emit('log', `Project folder: ${projectPath}`);

	// Create frontend
	if (frontend) {
		const frontendTemplate = getFrontendTemplateDefinition(frontend);
		eventEmitter.emit('log', '📦 Creating Vite React frontend...');
		await createFrontendWithStream(
			projectPath,
			trimmedName,
			frontend,
			eventEmitter,
			scaffold,
		);
	}

	// Create backend
	if (backend) {
		const backendTemplate = getBackendTemplateDefinition(backend);
		eventEmitter.emit('log', '📦 Creating Node.js backend...');
		await createBackendWithStream(
			projectPath,
			trimmedName,
			resolvedPorts.backendPort,
			backend,
			eventEmitter,
			linkedDatabase,
			scaffold,
		);
	}

	// Create .env if database linked
	if (false) {
		eventEmitter.emit(
			'log',
			'🔗 Creating .env file with database connection...',
		);
		const envPath = path.join(projectPath, 'backend', '.env');
		await fs.writeFile(
			envPath,
			`DATABASE_URL=postgresql://${linkedDatabase.credentials.user}:${linkedDatabase.credentials.password}@${linkedDatabase.credentials.host}:${linkedDatabase.credentials.port}/${linkedDatabase.credentials.database}`,
		);
	}

	eventEmitter.emit('log', '✅ Project created successfully!');
	eventEmitter.emit('complete', decorateProject(newProject));
	return decorateProject(newProject);
}

/**
 * Creates a project while streaming progress updates back to the SSE route.
 *
 * @param {{name: string, frontend?: string | null, backend?: string | null, databaseId?: string | null, frontendPort?: string | number | null, backendPort?: string | number | null, projectLocation?: string, autoCreateRepo?: boolean, visibility?: 'public' | 'private'}} data - Project creation payload from the client.
 * @param {import('events').EventEmitter} eventEmitter - Event emitter used by the streaming route.
 * @returns {Promise<object>} Newly created project record.
 */
async function createProjectWithStreamSafe(data, eventEmitter) {
	const {
		name,
		frontend,
		backend,
		databaseId,
		frontendPort,
		backendPort,
		projectLocation,
		autoCreateRepo,
		visibility,
	} = data;
	const projects = loadProjects();
	const trimmedName = String(name || '').trim();

	if (!trimmedName) {
		eventEmitter.emit('error', 'Project name is required');
		throw new Error('Project name is required');
	}

	if (findProject(projects, trimmedName)) {
		eventEmitter.emit('error', 'Project name already exists');
		throw new Error('Name exists');
	}

	let linkedDatabase = null;
	if (databaseId) {
		linkedDatabase = getDatabaseById(databaseId);
		if (!linkedDatabase) {
			eventEmitter.emit('error', 'Database not found');
			throw new Error('Database not found');
		}
	}

	try {
		ensureSupportedProjectTemplates({ frontend, backend });
	} catch (error) {
		eventEmitter.emit('error', error.message);
		throw error;
	}

	let resolvedPorts;
	try {
		resolvedPorts = validateProjectPorts({
			frontend,
			backend,
			frontendPort,
			backendPort,
		});
	} catch (error) {
		eventEmitter.emit('error', error.message);
		throw error;
	}

	eventEmitter.emit('log', `Creating project: ${name}`);
	const scaffold = resolveProjectScaffold({
		...data,
		name: trimmedName,
		frontend,
		backend,
	});
	const projectPath = buildProjectPath(trimmedName, projectLocation);

	if (await fs.pathExists(projectPath)) {
		eventEmitter.emit('error', 'Project folder already exists');
		throw new Error('Project folder already exists');
	}

	const newProject = {
		name: trimmedName,
		frontend: frontend || null,
		backend: backend || null,
		databaseId: linkedDatabase ? linkedDatabase.id : null,
		frontendPort: resolvedPorts.frontendPort,
		backendPort: resolvedPorts.backendPort,
		projectPath,
		scaffold,
		status: 'stopped',
	};

	projects.push(newProject);
	saveProjects(projects);

	try {
		await fs.mkdirp(projectPath);
		eventEmitter.emit('log', `Project folder: ${projectPath}`);

		if (frontend) {
			const frontendTemplate = getFrontendTemplateDefinition(frontend);
			eventEmitter.emit(
				'log',
				`Creating ${frontendTemplate.label} frontend...`,
			);
			await createFrontendWithStream(
				projectPath,
				trimmedName,
				frontend,
				eventEmitter,
				scaffold,
			);
		}

		if (backend) {
			const backendTemplate = getBackendTemplateDefinition(backend);
			eventEmitter.emit(
				'log',
				`Creating ${backendTemplate.label} backend...`,
			);
			await createBackendWithStream(
				projectPath,
				trimmedName,
				resolvedPorts.backendPort,
				backend,
				eventEmitter,
				linkedDatabase,
				scaffold,
			);
		}

		if (false) {
			eventEmitter.emit(
				'log',
				'Creating .env file with database connection...',
			);
			const envPath = path.join(projectPath, 'backend', '.env');
			await fs.writeFile(
				envPath,
				`DATABASE_URL=postgresql://${linkedDatabase.credentials.user}:${linkedDatabase.credentials.password}@${linkedDatabase.credentials.host}:${linkedDatabase.credentials.port}/${linkedDatabase.credentials.database}`,
			);
		}
	} catch (error) {
		await cleanupFailedProjectCreation(trimmedName, projectPath);
		eventEmitter.emit(
			'log',
			'Removed incomplete project files after setup failure.',
		);
		throw error;
	}

	newProject.repository = await initializeProjectRepository(newProject, {
		autoCreateRepo,
		projectPath,
		onLog: (message) => eventEmitter.emit('log', message),
		visibility,
	});
	saveProjects(projects);

	eventEmitter.emit('log', 'Project created successfully!');
	eventEmitter.emit('complete', decorateProject(newProject));
	return decorateProject(newProject);
}

function getDatabaseEnvContent(linkedDatabase) {
	if (!linkedDatabase) {
		return '';
	}

	const connectionString = getConnectionString(linkedDatabase);
	return linkedDatabase.type === 'mongodb'
		? `MONGO_URL=${connectionString}`
		: `DATABASE_URL=${connectionString}`;
}

function getLinkedDatabaseEnvironmentKey(linkedDatabase) {
	if (!linkedDatabase) {
		return null;
	}

	return linkedDatabase.type === 'mongodb' ? 'MONGO_URL' : 'DATABASE_URL';
}

async function writeProjectFiles(rootPath, files) {
	for (const [relativePath, content] of Object.entries(files)) {
		const targetPath = path.join(rootPath, relativePath);
		await fs.mkdirp(path.dirname(targetPath));
		await fs.writeFile(targetPath, content);
	}
}

function buildStaticFrontendBlueprint(name, scaffold = null) {
	const projectScaffold = resolveProjectScaffold({ name, scaffold });
	return {
		label: 'HTML + CSS + JS',
		files: {
			'README.md': `# ${name}

This is a plain HTML, CSS, and JavaScript starter generated by the dashboard.
${projectScaffold.description}
The preview server uses a tiny built-in Node script so the dashboard can launch it automatically.
`,
			'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Starter Project</p>
        <h1>${name}</h1>
        <p class="lead">
          ${projectScaffold.description}
        </p>
        <div class="hero-actions">
          <button id="refresh-button" type="button">Refresh dashboard clock</button>
          <a href="https://developer.mozilla.org/" target="_blank" rel="noreferrer">
            Open docs
          </a>
        </div>
      </section>

      <section class="card-grid">
        <article class="card">
          <span class="card-label">Stack</span>
          <h2>HTML + CSS + JS</h2>
          <p>Start editing <code>index.html</code>, <code>styles.css</code>, and <code>script.js</code>.</p>
        </article>
        <article class="card">
          <span class="card-label">Clock</span>
          <h2 id="clock">--:--:--</h2>
          <p>Your local time updates when you click the action button.</p>
        </article>
        <article class="card">
          <span class="card-label">Visits</span>
          <h2 id="visit-count">0</h2>
          <p>This counter is stored with <code>localStorage</code>.</p>
        </article>
      </section>
    </main>

    <script src="./script.js"></script>
  </body>
</html>
`,
			'styles.css': `:root {
  color-scheme: light;
  --bg: #f3efe5;
  --panel: #fffaf1;
  --ink: #1f2933;
  --accent: #d66b2d;
  --accent-dark: #9f4210;
  --line: rgba(31, 41, 51, 0.12);
  --shadow: 0 18px 40px rgba(31, 41, 51, 0.08);
  font-family: "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(214, 107, 45, 0.16), transparent 30rem),
    linear-gradient(180deg, #f9f4eb 0%, var(--bg) 100%);
  color: var(--ink);
}

.shell {
  width: min(960px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 4rem 0 5rem;
}

.hero {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 28px;
  box-shadow: var(--shadow);
  padding: 2rem;
}

.eyebrow,
.card-label {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.74rem;
  color: var(--accent-dark);
}

.hero h1,
.card h2 {
  margin: 0.35rem 0 0.85rem;
}

.lead {
  max-width: 42rem;
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  margin-top: 1.5rem;
}

.hero-actions button,
.hero-actions a {
  border: 0;
  border-radius: 999px;
  padding: 0.9rem 1.2rem;
  background: var(--accent);
  color: white;
  cursor: pointer;
  text-decoration: none;
  font: inherit;
}

.hero-actions a {
  background: #25364d;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin-top: 1.25rem;
}

.card {
  background: rgba(255, 250, 241, 0.88);
  border: 1px solid var(--line);
  border-radius: 22px;
  padding: 1.25rem;
  box-shadow: var(--shadow);
}

code {
  background: rgba(31, 41, 51, 0.08);
  border-radius: 6px;
  padding: 0.14rem 0.4rem;
}

@media (max-width: 640px) {
  .shell {
    padding-top: 2rem;
  }

  .hero {
    padding: 1.4rem;
  }
}
`,
			'script.js': `const clockElement = document.querySelector('#clock');
const visitCountElement = document.querySelector('#visit-count');
const refreshButton = document.querySelector('#refresh-button');

function updateClock() {
  clockElement.textContent = new Date().toLocaleTimeString();
}

function updateVisits() {
  const nextCount = Number(localStorage.getItem('dashboard-static-visits') || '0') + 1;
  localStorage.setItem('dashboard-static-visits', String(nextCount));
  visitCountElement.textContent = String(nextCount);
}

refreshButton.addEventListener('click', updateClock);

updateClock();
updateVisits();
`,
			'serve-static.js': `const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDirectory = __dirname;
const port = Number(process.env.PORT || process.argv[2] || 3000);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function resolveFilePath(requestUrl) {
  const url = new URL(requestUrl, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.join(rootDirectory, pathname);

  if (!filePath.startsWith(rootDirectory)) {
    return null;
  }

  return filePath;
}

const server = http.createServer((request, response) => {
  const filePath = resolveFilePath(request.url || '/');

  if (!filePath) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      const status = error.code === 'ENOENT' ? 404 : 500;
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(status === 404 ? 'Not found' : 'Server error');
      return;
    }

    const contentType = mimeTypes[path.extname(filePath)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(buffer);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log('Serving static frontend on http://localhost:' + port);
});
`,
		},
	};
}

function buildSimpleBackendReadme(name, label, startCommand, scaffold = null) {
	const projectScaffold = resolveProjectScaffold({ name, scaffold });
	return `# ${name}

This ${label} starter was generated by the dashboard.

${projectScaffold.description}

Version: ${projectScaffold.version}

Run it manually with:

\`\`\`
${startCommand}
\`\`\`

If you link a database in the dashboard, the generated \`.env\` file will contain the connection string.
`;
}

function buildPythonBackendContent(name, port, linkedDatabase = null) {
	const databaseEnvKey = linkedDatabase
		? JSON.stringify(getLinkedDatabaseEnvironmentKey(linkedDatabase))
		: 'None';

	return `import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

PROJECT_NAME = ${JSON.stringify(name)}
DEFAULT_PORT = ${port}
DATABASE_ENV_KEY = ${databaseEnvKey}


def load_env_file():
    env_path = Path(__file__).with_name('.env')
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue

        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip())


load_env_file()
PORT = int(os.environ.get('PORT', DEFAULT_PORT))


class AppHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, payload):
        body = json.dumps(payload, indent=2).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        request_path = urlparse(self.path).path
        database_configured = bool(os.environ.get(DATABASE_ENV_KEY)) if DATABASE_ENV_KEY else False

        if request_path not in ('/', '/health'):
            self._send_json(
                404,
                {
                    'error': 'Not found',
                    'path': request_path,
                },
            )
            return

        self._send_json(
            200,
            {
                'message': f'Hello from {PROJECT_NAME}',
                'runtime': 'python',
                'path': request_path,
                'port': PORT,
                'databaseConfigured': database_configured,
            },
        )


def main():
    server = ThreadingHTTPServer(('0.0.0.0', PORT), AppHandler)
    print(f'Running {PROJECT_NAME} on http://localhost:{PORT}')
    server.serve_forever()


if __name__ == '__main__':
    main()
`;
}

function buildPhpBackendContent(name, linkedDatabase = null) {
	const databaseEnvKey = linkedDatabase
		? JSON.stringify(getLinkedDatabaseEnvironmentKey(linkedDatabase))
		: 'null';

	return `<?php
declare(strict_types=1);

function loadEnvFile(string $filePath): void
{
    if (!is_file($filePath)) {
        return;
    }

    $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }

    foreach ($lines as $rawLine) {
        $line = trim($rawLine);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);

        if ($key === '') {
            continue;
        }

        putenv($key . '=' . $value);
        $_ENV[$key] = $value;
        $_SERVER[$key] = $value;
    }
}

loadEnvFile(__DIR__ . DIRECTORY_SEPARATOR . '.env');

$projectName = ${JSON.stringify(name)};
$databaseEnvKey = ${databaseEnvKey};
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$databaseConfigured = $databaseEnvKey !== null && (bool) getenv($databaseEnvKey);

header('Content-Type: application/json; charset=utf-8');

if ($requestPath !== '/' && $requestPath !== '/health') {
    http_response_code(404);
    echo json_encode(
        [
            'error' => 'Not found',
            'path' => $requestPath,
        ],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
    );
    exit;
}

echo json_encode(
    [
        'message' => 'Hello from ' . $projectName,
        'runtime' => 'php',
        'path' => $requestPath,
        'databaseConfigured' => $databaseConfigured,
        'timestamp' => gmdate(DATE_ATOM),
    ],
    JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
);
`;
}

function buildJavaPackageDeclaration(projectScaffold) {
	return projectScaffold.javaPackageName
		? `package ${projectScaffold.javaPackageName};\n\n`
		: '';
}

function buildJavaCompileAndRunCommand(projectScaffold) {
	return `javac --release ${projectScaffold.javaVersion} -d out ${getJavaSourceRelativePath(projectScaffold)} && java -cp out ${getJavaQualifiedMainClass(projectScaffold)}`;
}

function buildJavaBackendContent(
	name,
	port,
	linkedDatabase = null,
	scaffold = null,
) {
	const databaseEnvKey = linkedDatabase
		? JSON.stringify(getLinkedDatabaseEnvironmentKey(linkedDatabase))
		: 'null';
	const projectScaffold = resolveProjectScaffold({
		name,
		backend: 'java',
		scaffold,
	});

	return `${buildJavaPackageDeclaration(projectScaffold)}import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ${projectScaffold.javaMainClass} {
    private static final String PROJECT_NAME = ${JSON.stringify(name)};
    private static final int DEFAULT_PORT = ${port};
    private static final String DATABASE_ENV_KEY = ${databaseEnvKey};

    public static void main(String[] args) throws Exception {
        Map<String, String> fileEnv = loadEnvFile();
        int port = resolvePort(fileEnv);

        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
        server.createContext("/", exchange -> handleRequest(exchange, fileEnv, port));
        server.setExecutor(null);
        server.start();

        System.out.println("Running " + PROJECT_NAME + " on http://localhost:" + port);
    }

    private static void handleRequest(HttpExchange exchange, Map<String, String> fileEnv, int port)
            throws IOException {
        String requestPath = exchange.getRequestURI().getPath();

        if (!"/".equals(requestPath) && !"/health".equals(requestPath)) {
            sendJson(
                    exchange,
                    404,
                    "{\\n" +
                            "  \\"error\\": \\"Not found\\",\\n" +
                            "  \\"path\\": \\"" + escapeJson(requestPath) + "\\"\\n" +
                            "}"
            );
            return;
        }

        boolean databaseConfigured = DATABASE_ENV_KEY != null
                && getConfigValue(DATABASE_ENV_KEY, fileEnv) != null;

        sendJson(
                exchange,
                200,
                "{\\n" +
                        "  \\"message\\": \\"Hello from " + escapeJson(PROJECT_NAME) + "\\",\\n" +
                        "  \\"runtime\\": \\"java\\",\\n" +
                        "  \\"path\\": \\"" + escapeJson(requestPath) + "\\",\\n" +
                        "  \\"port\\": " + port + ",\\n" +
                        "  \\"databaseConfigured\\": " + databaseConfigured + ",\\n" +
                        "  \\"timestamp\\": \\"" + escapeJson(Instant.now().toString()) + "\\"\\n" +
                        "}"
        );
    }

    private static void sendJson(HttpExchange exchange, int statusCode, String body) throws IOException {
        byte[] responseBytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, responseBytes.length);

        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(responseBytes);
        }
    }

    private static int resolvePort(Map<String, String> fileEnv) {
        String value = getConfigValue("PORT", fileEnv);
        if (value == null || value.trim().isEmpty()) {
            return DEFAULT_PORT;
        }

        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException error) {
            return DEFAULT_PORT;
        }
    }

    private static String getConfigValue(String key, Map<String, String> fileEnv) {
        String envValue = System.getenv(key);
        if (envValue != null && !envValue.trim().isEmpty()) {
            return envValue;
        }

        String fileValue = fileEnv.get(key);
        if (fileValue != null && !fileValue.trim().isEmpty()) {
            return fileValue;
        }

        return null;
    }

    private static Map<String, String> loadEnvFile() {
        Map<String, String> values = new LinkedHashMap<>();
        Path envPath = Paths.get(".env");

        if (!Files.exists(envPath)) {
            return values;
        }

        try {
            List<String> lines = Files.readAllLines(envPath, StandardCharsets.UTF_8);
            for (String rawLine : lines) {
                String line = rawLine.trim();
                if (line.isEmpty() || line.startsWith("#") || !line.contains("=")) {
                    continue;
                }

                int separatorIndex = line.indexOf('=');
                String key = line.substring(0, separatorIndex).trim();
                String value = line.substring(separatorIndex + 1).trim();

                if (!key.isEmpty()) {
                    values.putIfAbsent(key, value);
                }
            }
        } catch (IOException error) {
            System.err.println("Failed to read .env file: " + error.getMessage());
        }

        return values;
    }

    private static String escapeJson(String value) {
        StringBuilder builder = new StringBuilder();
        for (char current : value.toCharArray()) {
            switch (current) {
                case '\\\\':
                    builder.append('\\').append('\\');
                    break;
                case '"':
                    builder.append('\\').append('"');
                    break;
                case '\\n':
                    builder.append('\\').append('n');
                    break;
                case '\\r':
                    builder.append('\\').append('r');
                    break;
                case '\\t':
                    builder.append('\\').append('t');
                    break;
                default:
                    builder.append(current);
                    break;
            }
        }

        return builder.toString();
    }
}
`;
}

function buildPythonCliAppContent(name, linkedDatabase = null) {
	const databaseEnvKey = linkedDatabase
		? JSON.stringify(getLinkedDatabaseEnvironmentKey(linkedDatabase))
		: 'None';

	return `import argparse
import json
import os
from pathlib import Path

PROJECT_NAME = ${JSON.stringify(name)}
DATABASE_ENV_KEY = ${databaseEnvKey}
SAMPLE_TASKS = [
    {"title": "Wire your first command", "done": True},
    {"title": "Add domain logic", "done": False},
    {"title": "Write smoke tests", "done": False},
]


def load_env_file():
    env_path = Path(__file__).resolve().parent.parent / '.env'
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue

        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip())


def build_summary():
    database_configured = bool(os.environ.get(DATABASE_ENV_KEY)) if DATABASE_ENV_KEY else False
    return {
        "project": PROJECT_NAME,
        "databaseConfigured": database_configured,
        "cwd": str(Path.cwd()),
    }


def handle_hello(args):
    summary = build_summary()
    print(f"Hello, {args.name}!")
    print(json.dumps(summary, indent=2))


def handle_tasks(_args):
    for index, task in enumerate(SAMPLE_TASKS, start=1):
        status = "done" if task["done"] else "todo"
        print(f"{index}. [{status}] {task['title']}")


def handle_doctor(args):
    payload = build_summary()
    payload["python"] = os.sys.version.split()[0]
    if args.json:
        print(json.dumps(payload, indent=2))
        return

    for key, value in payload.items():
        print(f"{key}: {value}")


def build_parser():
    parser = argparse.ArgumentParser(
        prog=PROJECT_NAME,
        description="Example Python CLI project generated by the dashboard.",
    )
    subparsers = parser.add_subparsers(dest="command", required=False)

    hello_parser = subparsers.add_parser("hello", help="Print a friendly greeting.")
    hello_parser.add_argument("name", nargs="?", default="builder")
    hello_parser.set_defaults(handler=handle_hello)

    tasks_parser = subparsers.add_parser("tasks", help="List sample project tasks.")
    tasks_parser.set_defaults(handler=handle_tasks)

    doctor_parser = subparsers.add_parser("doctor", help="Print environment diagnostics.")
    doctor_parser.add_argument("--json", action="store_true")
    doctor_parser.set_defaults(handler=handle_doctor)

    return parser


def main(argv=None):
    load_env_file()
    parser = build_parser()
    args = parser.parse_args(argv)
    handler = getattr(args, "handler", handle_hello)
    if not hasattr(args, "name"):
        args.name = "builder"
    handler(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;
}

function buildJavaConsoleAppContent(
	name,
	linkedDatabase = null,
	scaffold = null,
) {
	const databaseEnvKey = linkedDatabase
		? JSON.stringify(getLinkedDatabaseEnvironmentKey(linkedDatabase))
		: 'null';
	const projectScaffold = resolveProjectScaffold({
		name,
		backend: 'java-console',
		scaffold,
	});

	return `${buildJavaPackageDeclaration(projectScaffold)}import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ${projectScaffold.javaMainClass} {
    private static final String PROJECT_NAME = ${JSON.stringify(name)};
    private static final String DATABASE_ENV_KEY = ${databaseEnvKey};

    public static void main(String[] args) {
        Map<String, String> fileEnv = loadEnvFile();
        String command = args.length > 0 ? args[0].trim().toLowerCase() : "hello";

        switch (command) {
            case "tasks":
                printTasks();
                break;
            case "doctor":
                printDoctor(fileEnv);
                break;
            default:
                printHello(args, fileEnv);
                break;
        }
    }

    private static void printHello(String[] args, Map<String, String> fileEnv) {
        String target = args.length > 1 ? args[1] : "builder";
        System.out.println("Hello, " + target + "!");
        System.out.println("Project: " + PROJECT_NAME);
        System.out.println("Database configured: " + isDatabaseConfigured(fileEnv));
    }

    private static void printTasks() {
        List<String> tasks = List.of(
                "Wire your first command",
                "Add domain logic",
                "Write smoke tests"
        );

        for (int index = 0; index < tasks.size(); index += 1) {
            System.out.println((index + 1) + ". " + tasks.get(index));
        }
    }

    private static void printDoctor(Map<String, String> fileEnv) {
        System.out.println("project: " + PROJECT_NAME);
        System.out.println("java: " + System.getProperty("java.version"));
        System.out.println("cwd: " + Paths.get(".").toAbsolutePath().normalize());
        System.out.println("databaseConfigured: " + isDatabaseConfigured(fileEnv));
    }

    private static boolean isDatabaseConfigured(Map<String, String> fileEnv) {
        return DATABASE_ENV_KEY != null && getConfigValue(DATABASE_ENV_KEY, fileEnv) != null;
    }

    private static String getConfigValue(String key, Map<String, String> fileEnv) {
        String envValue = System.getenv(key);
        if (envValue != null && !envValue.trim().isEmpty()) {
            return envValue;
        }

        String fileValue = fileEnv.get(key);
        if (fileValue != null && !fileValue.trim().isEmpty()) {
            return fileValue;
        }

        return null;
    }

    private static Map<String, String> loadEnvFile() {
        Map<String, String> values = new LinkedHashMap<>();
        Path envPath = Paths.get(".env");

        if (!Files.exists(envPath)) {
            return values;
        }

        try {
            List<String> lines = Files.readAllLines(envPath, StandardCharsets.UTF_8);
            for (String rawLine : lines) {
                String line = rawLine.trim();
                if (line.isEmpty() || line.startsWith("#") || !line.contains("=")) {
                    continue;
                }

                int separatorIndex = line.indexOf('=');
                String key = line.substring(0, separatorIndex).trim();
                String value = line.substring(separatorIndex + 1).trim();

                if (!key.isEmpty()) {
                    values.putIfAbsent(key, value);
                }
            }
        } catch (IOException error) {
            System.err.println("Failed to read .env file: " + error.getMessage());
        }

        return values;
    }
}
`;
}

function buildJavaMavenAppContent(
	name,
	linkedDatabase = null,
	scaffold = null,
) {
	const databaseEnvKey = linkedDatabase
		? JSON.stringify(getLinkedDatabaseEnvironmentKey(linkedDatabase))
		: 'null';
	const projectScaffold = resolveProjectScaffold({
		name,
		backend: 'java-maven',
		scaffold,
	});

	return `${buildJavaPackageDeclaration(projectScaffold)}import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ${projectScaffold.javaMainClass} {
    private static final String PROJECT_NAME = ${JSON.stringify(name)};
    private static final String DATABASE_ENV_KEY = ${databaseEnvKey};

    public static void main(String[] args) {
        Map<String, String> fileEnv = loadEnvFile();
        String command = args.length > 0 ? args[0].trim().toLowerCase() : "hello";

        switch (command) {
            case "tasks":
                printTasks();
                break;
            case "doctor":
                printDoctor(fileEnv);
                break;
            default:
                printHello(args, fileEnv);
                break;
        }
    }

    private static void printHello(String[] args, Map<String, String> fileEnv) {
        String target = args.length > 1 ? args[1] : "builder";
        System.out.println("Hello, " + target + "!");
        System.out.println("Project: " + PROJECT_NAME);
        System.out.println("Database configured: " + isDatabaseConfigured(fileEnv));
    }

    private static void printTasks() {
        List<String> tasks = List.of(
                "Wire your first Maven goal",
                "Add domain logic",
                "Package the application"
        );

        for (int index = 0; index < tasks.size(); index += 1) {
            System.out.println((index + 1) + ". " + tasks.get(index));
        }
    }

    private static void printDoctor(Map<String, String> fileEnv) {
        System.out.println("project: " + PROJECT_NAME);
        System.out.println("java: " + System.getProperty("java.version"));
        System.out.println("cwd: " + Paths.get(".").toAbsolutePath().normalize());
        System.out.println("databaseConfigured: " + isDatabaseConfigured(fileEnv));
    }

    private static boolean isDatabaseConfigured(Map<String, String> fileEnv) {
        return DATABASE_ENV_KEY != null && getConfigValue(DATABASE_ENV_KEY, fileEnv) != null;
    }

    private static String getConfigValue(String key, Map<String, String> fileEnv) {
        String envValue = System.getenv(key);
        if (envValue != null && !envValue.trim().isEmpty()) {
            return envValue;
        }

        String fileValue = fileEnv.get(key);
        if (fileValue != null && !fileValue.trim().isEmpty()) {
            return fileValue;
        }

        return null;
    }

    private static Map<String, String> loadEnvFile() {
        Map<String, String> values = new LinkedHashMap<>();
        Path envPath = Paths.get(".env");

        if (!Files.exists(envPath)) {
            return values;
        }

        try {
            List<String> lines = Files.readAllLines(envPath, StandardCharsets.UTF_8);
            for (String rawLine : lines) {
                String line = rawLine.trim();
                if (line.isEmpty() || line.startsWith("#") || !line.contains("=")) {
                    continue;
                }

                int separatorIndex = line.indexOf('=');
                String key = line.substring(0, separatorIndex).trim();
                String value = line.substring(separatorIndex + 1).trim();

                if (!key.isEmpty()) {
                    values.putIfAbsent(key, value);
                }
            }
        } catch (IOException error) {
            System.err.println("Failed to read .env file: " + error.getMessage());
        }

        return values;
    }
}
`;
}

function escapeXml(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function buildMavenPomContent(name, scaffold = null) {
	const projectScaffold = resolveProjectScaffold({
		name,
		backend: 'java-maven',
		scaffold,
	});

	return `<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>${projectScaffold.javaGroupId}</groupId>
  <artifactId>${projectScaffold.javaArtifactId}</artifactId>
  <version>${projectScaffold.version}</version>
  <name>${escapeXml(name)}</name>
  <description>${escapeXml(projectScaffold.description)}</description>

  <properties>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <maven.compiler.release>${projectScaffold.javaVersion}</maven.compiler.release>
    <exec.mainClass>${projectScaffold.javaQualifiedMainClass}</exec.mainClass>
  </properties>

  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.11.0</version>
      </plugin>
      <plugin>
        <groupId>org.codehaus.mojo</groupId>
        <artifactId>exec-maven-plugin</artifactId>
        <version>3.1.1</version>
        <configuration>
          <mainClass>\${exec.mainClass}</mainClass>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

async function moveGeneratedTemplateIfNeeded(frontendPath, name) {
	const nestedPath = path.join(frontendPath, name);
	if (!(await fs.pathExists(nestedPath))) {
		return;
	}

	const files = await fs.readdir(nestedPath);
	for (const file of files) {
		await fs.move(
			path.join(nestedPath, file),
			path.join(frontendPath, file),
			{
				overwrite: true,
			},
		);
	}
	await fs.remove(nestedPath);
}

async function installProjectDependencies(targetPath, eventEmitter = null) {
	await new Promise((resolve, reject) => {
		const installProc = spawnNpm(['install'], {
			cwd: targetPath,
			stdio: eventEmitter ? ['ignore', 'pipe', 'pipe'] : 'inherit',
		});

		if (eventEmitter) {
			installProc.stdout.on('data', (data) => {
				const output = data.toString().trim();
				if (
					output &&
					!output.includes('npm notice') &&
					!output.includes('npm WARN')
				) {
					eventEmitter.emit('log', `  ${output}`);
				}
			});
			installProc.stderr.on('data', (data) => {
				const output = data.toString().trim();
				if (output && !output.includes('npm WARN')) {
					eventEmitter.emit('log', `  warning: ${output}`);
				}
			});
		}

		installProc.on('close', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`npm install failed with code ${code}`));
		});
		installProc.on('error', reject);
	});
}

function buildExpressEntryContent(name, port, linkedDatabase) {
	const header = `
require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || ${port};
const PROJECT_NAME = ${JSON.stringify(name)};
`;

	if (!linkedDatabase) {
		return `${header}
app.get('/', async (_req, res) => {
  res.json({
    message: 'Hello from ' + PROJECT_NAME,
    framework: 'express',
  });
});

app.listen(PORT, () => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT));
`;
	}

	switch (linkedDatabase.type) {
		case 'postgres':
			return `${header}
const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

client.connect().then(() => {
  console.log('Connected to PostgreSQL');
}).catch((error) => {
  console.error('PostgreSQL connection error:', error.message);
});

app.get('/', async (_req, res) => {
  try {
    const result = await client.query('SELECT NOW() AS now');
    res.json({
      message: 'Hello from ' + PROJECT_NAME,
      framework: 'express',
      database: 'postgres',
      now: result.rows[0].now,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT));
`;
		case 'mysql':
			return `${header}
const mysql = require('mysql2/promise');
let pool;

(async () => {
  try {
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
    });
    await pool.query('SELECT 1');
    console.log('MySQL pool ready');
  } catch (error) {
    console.error('MySQL connection error:', error.message);
  }
})();

app.get('/', async (_req, res) => {
  try {
    if (!pool) {
      throw new Error('Database pool not ready');
    }

    const [rows] = await pool.query('SELECT NOW() AS now');
    res.json({
      message: 'Hello from ' + PROJECT_NAME,
      framework: 'express',
      database: 'mysql',
      now: rows[0].now,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT));
`;
		case 'mongodb':
			return `${header}
const { MongoClient } = require('mongodb');
let db;
const mongoUrl = process.env.MONGO_URL;

if (!mongoUrl) {
  console.error('MONGO_URL is not set');
} else {
  MongoClient.connect(mongoUrl)
    .then((client) => {
      db = client.db();
      console.log('Connected to MongoDB');
    })
    .catch((error) => {
      console.error('MongoDB connection error:', error.message);
    });
}

app.get('/', async (_req, res) => {
  try {
    if (!db) {
      throw new Error('Database not connected');
    }

    const collections = await db.listCollections().toArray();
    res.json({
      message: 'Hello from ' + PROJECT_NAME,
      framework: 'express',
      database: 'mongodb',
      collections: collections.map((collection) => collection.name),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT));
`;
		default:
			return `${header}
app.get('/', async (_req, res) => {
  res.json({
    message: 'Hello from ' + PROJECT_NAME,
    framework: 'express',
  });
});

app.listen(PORT, () => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT));
`;
	}
}

function buildFastifyEntryContent(name, port, linkedDatabase) {
	const header = `
require('dotenv').config();
const fastify = require('fastify')({ logger: false });
const PORT = process.env.PORT || ${port};
const PROJECT_NAME = ${JSON.stringify(name)};
`;

	if (!linkedDatabase) {
		return `${header}
fastify.get('/', async () => ({
  message: 'Hello from ' + PROJECT_NAME,
  framework: 'fastify',
}));

fastify
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
`;
	}

	switch (linkedDatabase.type) {
		case 'postgres':
			return `${header}
const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

client.connect().then(() => {
  console.log('Connected to PostgreSQL');
}).catch((error) => {
  console.error('PostgreSQL connection error:', error.message);
});

fastify.get('/', async (_request, reply) => {
  try {
    const result = await client.query('SELECT NOW() AS now');
    return {
      message: 'Hello from ' + PROJECT_NAME,
      framework: 'fastify',
      database: 'postgres',
      now: result.rows[0].now,
    };
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

fastify
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
`;
		case 'mysql':
			return `${header}
const mysql = require('mysql2/promise');
let pool;

(async () => {
  try {
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
    });
    await pool.query('SELECT 1');
    console.log('MySQL pool ready');
  } catch (error) {
    console.error('MySQL connection error:', error.message);
  }
})();

fastify.get('/', async (_request, reply) => {
  try {
    if (!pool) {
      throw new Error('Database pool not ready');
    }

    const [rows] = await pool.query('SELECT NOW() AS now');
    return {
      message: 'Hello from ' + PROJECT_NAME,
      framework: 'fastify',
      database: 'mysql',
      now: rows[0].now,
    };
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

fastify
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
`;
		case 'mongodb':
			return `${header}
const { MongoClient } = require('mongodb');
let db;
const mongoUrl = process.env.MONGO_URL;

if (!mongoUrl) {
  console.error('MONGO_URL is not set');
} else {
  MongoClient.connect(mongoUrl)
    .then((client) => {
      db = client.db();
      console.log('Connected to MongoDB');
    })
    .catch((error) => {
      console.error('MongoDB connection error:', error.message);
    });
}

fastify.get('/', async (_request, reply) => {
  try {
    if (!db) {
      throw new Error('Database not connected');
    }

    const collections = await db.listCollections().toArray();
    return {
      message: 'Hello from ' + PROJECT_NAME,
      framework: 'fastify',
      database: 'mongodb',
      collections: collections.map((collection) => collection.name),
    };
  } catch (error) {
    reply.code(500);
    return { error: error.message };
  }
});

fastify
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
`;
		default:
			return `${header}
fastify.get('/', async () => ({
  message: 'Hello from ' + PROJECT_NAME,
  framework: 'fastify',
}));

fastify
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
`;
	}
}

function buildKoaEntryContent(name, port, linkedDatabase) {
	const header = `
require('dotenv').config();
const Koa = require('koa');
const Router = require('@koa/router');
const app = new Koa();
const router = new Router();
const PORT = process.env.PORT || ${port};
const PROJECT_NAME = ${JSON.stringify(name)};
`;

	if (!linkedDatabase) {
		return `${header}
router.get('/', async (ctx) => {
  ctx.body = {
    message: 'Hello from ' + PROJECT_NAME,
    framework: 'koa',
  };
});

app.use(router.routes());
app.use(router.allowedMethods());
app.listen(PORT, () => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT));
`;
	}

	switch (linkedDatabase.type) {
		case 'postgres':
			return `${header}
const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

client.connect().then(() => {
  console.log('Connected to PostgreSQL');
}).catch((error) => {
  console.error('PostgreSQL connection error:', error.message);
});

router.get('/', async (ctx) => {
  try {
    const result = await client.query('SELECT NOW() AS now');
    ctx.body = {
      message: 'Hello from ' + PROJECT_NAME,
      framework: 'koa',
      database: 'postgres',
      now: result.rows[0].now,
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
});

app.use(router.routes());
app.use(router.allowedMethods());
app.listen(PORT, () => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT));
`;
		case 'mysql':
			return `${header}
const mysql = require('mysql2/promise');
let pool;

(async () => {
  try {
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
    });
    await pool.query('SELECT 1');
    console.log('MySQL pool ready');
  } catch (error) {
    console.error('MySQL connection error:', error.message);
  }
})();

router.get('/', async (ctx) => {
  try {
    if (!pool) {
      throw new Error('Database pool not ready');
    }

    const [rows] = await pool.query('SELECT NOW() AS now');
    ctx.body = {
      message: 'Hello from ' + PROJECT_NAME,
      framework: 'koa',
      database: 'mysql',
      now: rows[0].now,
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
});

app.use(router.routes());
app.use(router.allowedMethods());
app.listen(PORT, () => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT));
`;
		case 'mongodb':
			return `${header}
const { MongoClient } = require('mongodb');
let db;
const mongoUrl = process.env.MONGO_URL;

if (!mongoUrl) {
  console.error('MONGO_URL is not set');
} else {
  MongoClient.connect(mongoUrl)
    .then((client) => {
      db = client.db();
      console.log('Connected to MongoDB');
    })
    .catch((error) => {
      console.error('MongoDB connection error:', error.message);
    });
}

router.get('/', async (ctx) => {
  try {
    if (!db) {
      throw new Error('Database not connected');
    }

    const collections = await db.listCollections().toArray();
    ctx.body = {
      message: 'Hello from ' + PROJECT_NAME,
      framework: 'koa',
      database: 'mongodb',
      collections: collections.map((collection) => collection.name),
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
});

app.use(router.routes());
app.use(router.allowedMethods());
app.listen(PORT, () => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT));
`;
		default:
			return `${header}
router.get('/', async (ctx) => {
  ctx.body = {
    message: 'Hello from ' + PROJECT_NAME,
    framework: 'koa',
  };
});

app.use(router.routes());
app.use(router.allowedMethods());
app.listen(PORT, () => console.log('Running ' + PROJECT_NAME + ' on port ' + PORT));
`;
	}
}

function buildBackendBlueprint(
	name,
	port,
	template,
	linkedDatabase = null,
	scaffold = null,
) {
	const templateDefinition = getBackendTemplateDefinition(template);
	const projectScaffold = resolveProjectScaffold({
		name,
		backend: template,
		scaffold,
	});
	if (templateDefinition.kind === 'python') {
		return {
			label: templateDefinition.label,
			envContent: getDatabaseEnvContent(linkedDatabase),
			installDependencies: false,
			files: {
				'README.md': buildSimpleBackendReadme(
					name,
					templateDefinition.label,
					'python app.py',
					projectScaffold,
				),
				'app.py': buildPythonBackendContent(name, port, linkedDatabase),
			},
		};
	}

	if (templateDefinition.kind === 'python-cli') {
		return {
			label: templateDefinition.label,
			envContent: getDatabaseEnvContent(linkedDatabase),
			installDependencies: false,
			files: {
				'README.md': buildSimpleBackendReadme(
					name,
					templateDefinition.label,
					process.platform === 'win32'
						? 'py -3 -m app'
						: 'python3 -m app',
					projectScaffold,
				),
				'.gitignore': `__pycache__/
.pytest_cache/
.venv/
dist/
build/
`,
				'pyproject.toml': `[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "${projectScaffold.projectSlug}"
version = "${projectScaffold.version}"
description = "${projectScaffold.description.replace(/"/g, '\\"')}"
requires-python = ">=3.10"

[project.scripts]
${projectScaffold.projectSlug} = "app.cli:main"

[tool.setuptools]
packages = ["app"]
`,
				'app/__init__.py': `from .cli import main
`,
				'app/__main__.py': `from .cli import main

raise SystemExit(main())
`,
				'app/cli.py': buildPythonCliAppContent(name, linkedDatabase),
				'tests/test_cli.py': `import unittest

from app.cli import build_summary


class CliTests(unittest.TestCase):
    def test_build_summary_includes_project_name(self):
        summary = build_summary()
        self.assertEqual(summary["project"], ${JSON.stringify(name)})


if __name__ == "__main__":
    unittest.main()
`,
			},
		};
	}

	if (templateDefinition.kind === 'php') {
		return {
			label: templateDefinition.label,
			envContent: getDatabaseEnvContent(linkedDatabase),
			installDependencies: false,
			files: {
				'README.md': buildSimpleBackendReadme(
					name,
					templateDefinition.label,
					'php -S 127.0.0.1:8000 -t .',
					projectScaffold,
				),
				'index.php': buildPhpBackendContent(name, linkedDatabase),
			},
		};
	}

	if (templateDefinition.kind === 'java') {
		return {
			label: templateDefinition.label,
			envContent: getDatabaseEnvContent(linkedDatabase),
			installDependencies: false,
			files: {
				'README.md': buildSimpleBackendReadme(
					name,
					templateDefinition.label,
					buildJavaCompileAndRunCommand(projectScaffold),
					projectScaffold,
				),
				[getJavaSourceRelativePath(projectScaffold)]:
					buildJavaBackendContent(
						name,
						port,
						linkedDatabase,
						projectScaffold,
					),
			},
		};
	}

	if (templateDefinition.kind === 'java-console') {
		return {
			label: templateDefinition.label,
			envContent: getDatabaseEnvContent(linkedDatabase),
			installDependencies: false,
			files: {
				'README.md': buildSimpleBackendReadme(
					name,
					templateDefinition.label,
					buildJavaCompileAndRunCommand(projectScaffold),
					projectScaffold,
				),
				'.gitignore': `out/
`,
				[getJavaSourceRelativePath(projectScaffold)]:
					buildJavaConsoleAppContent(
						name,
						linkedDatabase,
						projectScaffold,
					),
			},
		};
	}

	if (templateDefinition.kind === 'java-maven') {
		return {
			label: templateDefinition.label,
			envContent: getDatabaseEnvContent(linkedDatabase),
			installDependencies: false,
			files: {
				'README.md': buildSimpleBackendReadme(
					name,
					templateDefinition.label,
					'mvn exec:java',
					projectScaffold,
				),
				'.gitignore': `target/
`,
				'pom.xml': buildMavenPomContent(name, projectScaffold),
				[getJavaSourceRelativePath(projectScaffold, {
					mavenLayout: true,
				})]: buildJavaMavenAppContent(
					name,
					linkedDatabase,
					projectScaffold,
				),
			},
		};
	}

	const dependencies = { dotenv: '^16.3.1' };
	const devDependencies = { nodemon: '^2.0.22' };
	let indexContent = '';

	switch (templateDefinition.framework) {
		case 'fastify':
			dependencies.fastify = '^4.28.1';
			indexContent = buildFastifyEntryContent(name, port, linkedDatabase);
			break;
		case 'koa':
			dependencies.koa = '^2.15.3';
			dependencies['@koa/router'] = '^12.0.1';
			indexContent = buildKoaEntryContent(name, port, linkedDatabase);
			break;
		case 'express':
		default:
			dependencies.express = '^4.18.2';
			indexContent = buildExpressEntryContent(name, port, linkedDatabase);
			break;
	}

	if (linkedDatabase?.type === 'postgres') {
		dependencies.pg = '^8.11.0';
	}

	if (linkedDatabase?.type === 'mysql') {
		dependencies.mysql2 = '^3.6.0';
	}

	if (linkedDatabase?.type === 'mongodb') {
		dependencies.mongodb = '^5.7.0';
	}

	return {
		label: templateDefinition.label,
		envContent: getDatabaseEnvContent(linkedDatabase),
		installDependencies: true,
		files: {
			'package.json': JSON.stringify(
				{
					name: projectScaffold.projectSlug,
					version: projectScaffold.version,
					description: projectScaffold.description,
					main: 'index.js',
					scripts: {
						dev: 'nodemon index.js',
						start: 'node index.js',
					},
					dependencies,
					devDependencies,
				},
				null,
				2,
			),
			'index.js': indexContent,
		},
	};
}

// ---------- Frontend Creation ----------
async function applyFrontendMetadata(frontendPath, name, scaffold = null) {
	const projectScaffold = resolveProjectScaffold({ name, scaffold });
	const packagePath = path.join(frontendPath, 'package.json');
	if (await fs.pathExists(packagePath)) {
		const packageJson = await fs.readJson(packagePath);
		packageJson.name = projectScaffold.projectSlug;
		packageJson.version = projectScaffold.version;
		packageJson.description = projectScaffold.description;
		await fs.writeJson(packagePath, packageJson, { spaces: 2 });
	}

	const indexPath = path.join(frontendPath, 'index.html');
	if (await fs.pathExists(indexPath)) {
		let content = await fs.readFile(indexPath, 'utf8');
		content = content.replace(
			/<title>.*<\/title>/,
			`<title>${name}</title>`,
		);
		await fs.writeFile(indexPath, content);
	}
}

async function createFrontend(projectPath, name, template, scaffold = null) {
	const frontendPath = path.join(projectPath, 'frontend');
	const templateDefinition = getFrontendTemplateDefinition(template);
	await fs.mkdirp(frontendPath);

	if (templateDefinition.kind === 'static') {
		const blueprint = buildStaticFrontendBlueprint(name, scaffold);
		await writeProjectFiles(frontendPath, blueprint.files);
		return;
	}

	await new Promise((resolve, reject) => {
		const proc = spawnNpm(
			[
				'create',
				'vite@latest',
				'.',
				'--',
				'--template',
				templateDefinition.viteTemplate,
			],
			{
				cwd: frontendPath,
				stdio: 'inherit',
			},
		);
		proc.on('close', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`Vite creation failed with code ${code}`));
		});
		proc.on('error', reject);
	});

	await moveGeneratedTemplateIfNeeded(frontendPath, name);
	await installProjectDependencies(frontendPath);
	return;

	const nestedPath = path.join(frontendPath, name);
	if (await fs.pathExists(nestedPath)) {
		const files = await fs.readdir(nestedPath);
		for (const file of files) {
			await fs.move(
				path.join(nestedPath, file),
				path.join(frontendPath, file),
				{ overwrite: true },
			);
		}
		await fs.remove(nestedPath);
	}

	const configPath = path.join(frontendPath, 'vite.config.js');
	if (await fs.pathExists(configPath)) {
		const configContent = `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: ${port} }
})
`;
		await fs.writeFile(configPath, configContent);
	}

	await new Promise((resolve, reject) => {
		const installProc = spawnNpm(['install'], {
			cwd: frontendPath,
			stdio: 'inherit',
		});
		installProc.on('close', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`npm install failed with code ${code}`));
		});
		installProc.on('error', reject);
	});
}

async function createFrontendWithStream(
	projectPath,
	name,
	template,
	eventEmitter,
) {
	const frontendPath = path.join(projectPath, 'frontend');
	const templateDefinition = getFrontendTemplateDefinition(template);
	await fs.mkdirp(frontendPath);

	eventEmitter.emit('log', '  ⚡ Creating Vite project...');

	await new Promise((resolve, reject) => {
		const proc = spawnNpm(
			[
				'create',
				'vite@latest',
				'.',
				'--',
				'--template',
				templateDefinition.viteTemplate,
			],
			{
				cwd: frontendPath,
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);

		proc.stdout.on('data', (data) => {
			const output = data.toString().trim();
			if (output) {
				eventEmitter.emit('log', `  ${output}`);
			}
		});
		proc.stderr.on('data', (data) => {
			const output = data.toString().trim();
			if (output) {
				eventEmitter.emit('log', `  ⚠️ ${output}`);
			}
		});

		proc.on('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Vite creation failed with code ${code}`));
		});
		proc.on('error', reject);
	});

	await moveGeneratedTemplateIfNeeded(frontendPath, name);
	eventEmitter.emit('log', '  Installing frontend dependencies...');
	await installProjectDependencies(frontendPath, eventEmitter);
	eventEmitter.emit('log', '  Frontend created successfully');
	return;

	// Handle nested folder
	const nestedPath = path.join(frontendPath, name);
	if (await fs.pathExists(nestedPath)) {
		eventEmitter.emit('log', '  📁 Moving files from nested folder...');
		const files = await fs.readdir(nestedPath);
		for (const file of files) {
			await fs.move(
				path.join(nestedPath, file),
				path.join(frontendPath, file),
				{ overwrite: true },
			);
		}
		await fs.remove(nestedPath);
	}

	// Update vite config
	const configPath = path.join(frontendPath, 'vite.config.js');
	if (await fs.pathExists(configPath)) {
		const configContent = `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: ${port} }
})
`;
		await fs.writeFile(configPath, configContent);
		eventEmitter.emit(
			'log',
			`  ⚙️ Updated Vite config to use port ${port}`,
		);
	}

	eventEmitter.emit('log', '  📦 Installing npm dependencies...');
	await new Promise((resolve, reject) => {
		const installProc = spawnNpm(['install'], {
			cwd: frontendPath,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		installProc.stdout.on('data', (data) => {
			const output = data.toString().trim();
			if (
				output &&
				!output.includes('npm notice') &&
				!output.includes('npm WARN')
			) {
				eventEmitter.emit('log', `  ${output}`);
			}
		});
		installProc.stderr.on('data', (data) => {
			const output = data.toString().trim();
			if (output && !output.includes('npm WARN')) {
				eventEmitter.emit('log', `  ⚠️ ${output}`);
			}
		});

		installProc.on('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`npm install failed with code ${code}`));
		});
		installProc.on('error', reject);
	});

	eventEmitter.emit('log', '  ✅ Frontend created successfully');
}

// ---------- Backend Creation ----------
async function createBackend(
	projectPath,
	name,
	port,
	template,
	linkedDatabase = null,
) {
	const backendPath = path.join(projectPath, 'backend');
	const blueprint = buildBackendBlueprint(
		name,
		port,
		template,
		linkedDatabase,
	);
	await fs.mkdirp(backendPath);

	await fs.writeFile(
		path.join(backendPath, 'package.json'),
		JSON.stringify(blueprint.packageJson, null, 2),
	);
	await fs.writeFile(
		path.join(backendPath, 'index.js'),
		blueprint.indexContent,
	);

	if (blueprint.envContent) {
		await fs.writeFile(
			path.join(backendPath, '.env'),
			blueprint.envContent,
		);
	}

	await installProjectDependencies(backendPath);
	return;

	await fs.writeFile(
		path.join(backendPath, 'index.js'),
		`
const express = require("express");
const app = express();
const PORT = process.env.PORT || ${port};

app.get("/", (req, res) => {
  res.send("Hello from ${name}");
});

app.listen(PORT, () => console.log("Running ${name} on port " + PORT));
`,
	);

	await fs.writeFile(
		path.join(backendPath, 'package.json'),
		JSON.stringify(
			{
				name,
				version: '1.0.0',
				main: 'index.js',
				scripts: { dev: 'nodemon index.js' },
				dependencies: { express: '^4.18.2' },
				devDependencies: { nodemon: '^2.0.22' },
			},
			null,
			2,
		),
	);

	await new Promise((resolve, reject) => {
		const installProc = spawnNpm(['install'], {
			cwd: backendPath,
			stdio: 'inherit',
		});
		installProc.on('close', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`npm install failed with code ${code}`));
		});
		installProc.on('error', reject);
	});
}

async function createBackendWithStream(
	projectPath,
	name,
	port,
	template,
	eventEmitter,
	linkedDatabase = null,
) {
	const backendPath = path.join(projectPath, 'backend');
	const blueprint = buildBackendBlueprint(
		name,
		port,
		template,
		linkedDatabase,
	);
	await fs.mkdirp(backendPath);
	await fs.writeFile(
		path.join(backendPath, 'package.json'),
		JSON.stringify(blueprint.packageJson, null, 2),
	);
	await fs.writeFile(
		path.join(backendPath, 'index.js'),
		blueprint.indexContent,
	);

	eventEmitter.emit('log', `  Bootstrapping ${blueprint.label} server...`);

	if (blueprint.envContent) {
		await fs.writeFile(
			path.join(backendPath, '.env'),
			blueprint.envContent,
		);
		eventEmitter.emit('log', '  Wrote database environment file');
	}

	eventEmitter.emit('log', '  Installing backend dependencies...');
	await installProjectDependencies(backendPath, eventEmitter);
	eventEmitter.emit('log', '  Backend created successfully');
	return;

	eventEmitter.emit('log', '  📝 Creating Express server...');

	// Always include dotenv
	let dependencies = { express: '^4.18.2', dotenv: '^16.3.1' };
	let devDependencies = { nodemon: '^2.0.22' };

	// Base index.js with dotenv
	let indexContent = `
require('dotenv').config();
const express = require("express");
const app = express();
const PORT = process.env.PORT || ${port};

app.get("/", (req, res) => {
  res.send("Hello from ${name}");
});

app.listen(PORT, () => console.log("Running ${name} on port " + PORT));
`;

	if (linkedDatabase) {
		const connString = getConnectionString(linkedDatabase);
		switch (linkedDatabase.type) {
			case 'postgres':
				dependencies.pg = '^8.11.0';
				indexContent = `
require('dotenv').config();
const express = require("express");
const { Client } = require('pg');
const app = express();
const PORT = process.env.PORT || ${port};

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});
client.connect(err => {
  if (err) console.error('PostgreSQL connection error:', err.message);
  else console.log('Connected to PostgreSQL');
});

app.get("/", async (req, res) => {
  try {
    const result = await client.query('SELECT NOW()');
    res.send(\`Hello from ${name}! Database time: \${result.rows[0].now}\`);
  } catch (err) {
    res.status(500).send('Database error: ' + err.message);
  }
});

app.listen(PORT, () => console.log("Running ${name} on port " + PORT));
`;
				break;
			case 'mysql':
				dependencies.mysql2 = '^3.6.0';
				indexContent = `
require('dotenv').config();
const express = require("express");
const mysql = require('mysql2/promise');
const app = express();
const PORT = process.env.PORT || ${port};

let pool;
(async () => {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL not set');
    pool = mysql.createPool({
      uri: dbUrl,
      waitForConnections: true,
      connectionLimit: 10,
    });
    console.log('MySQL pool created');
  } catch (err) {
    console.error('Failed to create MySQL pool:', err.message);
  }
})();

app.get("/", async (req, res) => {
  try {
    if (!pool) throw new Error('Database pool not ready');
    const [rows] = await pool.query('SELECT NOW() as now');
    res.send(\`Hello from ${name}! Database time: \${rows[0].now}\`);
  } catch (err) {
    res.status(500).send('Database error: ' + err.message);
  }
});

app.listen(PORT, () => console.log("Running ${name} on port " + PORT));
`;
				break;
			case 'mongodb':
				dependencies.mongodb = '^5.7.0';
				indexContent = `
require('dotenv').config();
const express = require("express");
const { MongoClient } = require('mongodb');
const app = express();
const PORT = process.env.PORT || ${port};

let db;
const mongoUrl = process.env.MONGO_URL;
if (!mongoUrl) {
  console.error('MONGO_URL is not set in .env');
} else {
  MongoClient.connect(mongoUrl)
    .then(client => {
      db = client.db();
      console.log('Connected to MongoDB');
    })
    .catch(err => console.error('Failed to connect to MongoDB:', err.message));
}

app.get("/", async (req, res) => {
  try {
    if (!db) throw new Error('Database not connected');
    const collections = await db.listCollections().toArray();
    res.send(\`Hello from ${name}! Collections: \${collections.map(c => c.name).join(', ')}\`);
  } catch (err) {
    res.status(500).send('Database error: ' + err.message);
  }
});

app.listen(PORT, () => console.log("Running ${name} on port " + PORT));
`;
				break;
		}
	}

	// Write package.json
	await fs.writeFile(
		path.join(backendPath, 'package.json'),
		JSON.stringify(
			{
				name,
				version: '1.0.0',
				main: 'index.js',
				scripts: { dev: 'nodemon index.js' },
				dependencies,
				devDependencies,
			},
			null,
			2,
		),
	);

	await fs.writeFile(path.join(backendPath, 'index.js'), indexContent);

	// Write .env if linked database
	if (linkedDatabase) {
		const connString = getConnectionString(linkedDatabase);
		let envContent = '';
		if (linkedDatabase.type === 'mongodb') {
			envContent = `MONGO_URL=${connString}`;
		} else {
			envContent = `DATABASE_URL=${connString}`;
		}
		await fs.writeFile(path.join(backendPath, '.env'), envContent);
		eventEmitter.emit(
			'log',
			'  🔗 Created .env file with database connection',
		);
	}

	// Install dependencies (including dotenv)
	eventEmitter.emit('log', '  📦 Installing npm dependencies...');
	await new Promise((resolve, reject) => {
		const installProc = spawnNpm(['install'], {
			cwd: backendPath,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		installProc.stdout.on('data', (data) => {
			const output = data.toString().trim();
			if (
				output &&
				!output.includes('npm notice') &&
				!output.includes('npm WARN')
			) {
				eventEmitter.emit('log', `  ${output}`);
			}
		});
		installProc.stderr.on('data', (data) => {
			const output = data.toString().trim();
			if (output && !output.includes('npm WARN')) {
				eventEmitter.emit('log', `  ⚠️ ${output}`);
			}
		});
		installProc.on('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`npm install failed with code ${code}`));
		});
		installProc.on('error', reject);
	});
	eventEmitter.emit('log', '  ✅ Backend created successfully');
}

async function createFrontend(projectPath, name, template, scaffold = null) {
	const frontendPath = path.join(projectPath, 'frontend');
	const templateDefinition = getFrontendTemplateDefinition(template);
	await fs.mkdirp(frontendPath);

	if (templateDefinition.kind === 'static') {
		const blueprint = buildStaticFrontendBlueprint(name, scaffold);
		await writeProjectFiles(frontendPath, blueprint.files);
		return;
	}

	await new Promise((resolve, reject) => {
		const proc = spawnNpm(
			[
				'create',
				'vite@latest',
				'.',
				'--',
				'--template',
				templateDefinition.viteTemplate,
			],
			{
				cwd: frontendPath,
				stdio: 'inherit',
			},
		);
		proc.on('close', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`Vite creation failed with code ${code}`));
		});
		proc.on('error', reject);
	});

	await moveGeneratedTemplateIfNeeded(frontendPath, name);
	await applyFrontendMetadata(frontendPath, name, scaffold);
	await installProjectDependencies(frontendPath);
}

async function createFrontendWithStream(
	projectPath,
	name,
	template,
	eventEmitter,
	scaffold = null,
) {
	const frontendPath = path.join(projectPath, 'frontend');
	const templateDefinition = getFrontendTemplateDefinition(template);
	await fs.mkdirp(frontendPath);

	if (templateDefinition.kind === 'static') {
		const blueprint = buildStaticFrontendBlueprint(name, scaffold);
		eventEmitter.emit('log', '  Writing plain HTML starter files...');
		await writeProjectFiles(frontendPath, blueprint.files);
		eventEmitter.emit('log', '  Frontend created successfully');
		return;
	}

	eventEmitter.emit('log', '  Creating Vite project...');

	await new Promise((resolve, reject) => {
		const proc = spawnNpm(
			[
				'create',
				'vite@latest',
				'.',
				'--',
				'--template',
				templateDefinition.viteTemplate,
			],
			{
				cwd: frontendPath,
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);

		proc.stdout.on('data', (data) => {
			const output = data.toString().trim();
			if (output) {
				eventEmitter.emit('log', `  ${output}`);
			}
		});
		proc.stderr.on('data', (data) => {
			const output = data.toString().trim();
			if (output) {
				eventEmitter.emit('log', `  warning: ${output}`);
			}
		});

		proc.on('close', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`Vite creation failed with code ${code}`));
		});
		proc.on('error', reject);
	});

	await moveGeneratedTemplateIfNeeded(frontendPath, name);
	await applyFrontendMetadata(frontendPath, name, scaffold);
	eventEmitter.emit('log', '  Installing frontend dependencies...');
	await installProjectDependencies(frontendPath, eventEmitter);
	eventEmitter.emit('log', '  Frontend created successfully');
}

async function createBackend(
	projectPath,
	name,
	port,
	template,
	linkedDatabase = null,
	scaffold = null,
) {
	const backendPath = getBackendWorkspacePath(projectPath, template);
	const blueprint = buildBackendBlueprint(
		name,
		port,
		template,
		linkedDatabase,
		scaffold,
	);
	await fs.mkdirp(backendPath);
	await writeProjectFiles(backendPath, blueprint.files);

	if (blueprint.envContent) {
		await fs.writeFile(
			path.join(backendPath, '.env'),
			blueprint.envContent,
		);
	}

	if (blueprint.installDependencies) {
		await installProjectDependencies(backendPath);
	}
}

async function createBackendWithStream(
	projectPath,
	name,
	port,
	template,
	eventEmitter,
	linkedDatabase = null,
	scaffold = null,
) {
	const backendPath = getBackendWorkspacePath(projectPath, template);
	const blueprint = buildBackendBlueprint(
		name,
		port,
		template,
		linkedDatabase,
		scaffold,
	);
	await fs.mkdirp(backendPath);
	await writeProjectFiles(backendPath, blueprint.files);

	eventEmitter.emit('log', `  Bootstrapping ${blueprint.label} server...`);

	if (blueprint.envContent) {
		await fs.writeFile(
			path.join(backendPath, '.env'),
			blueprint.envContent,
		);
		eventEmitter.emit('log', '  Wrote database environment file');
	}

	if (blueprint.installDependencies) {
		eventEmitter.emit('log', '  Installing backend dependencies...');
		await installProjectDependencies(backendPath, eventEmitter);
	} else {
		eventEmitter.emit('log', '  Backend starter files are ready');
	}

	eventEmitter.emit('log', '  Backend created successfully');
}

function hasOwnUpdateValue(updates, key) {
	return Object.prototype.hasOwnProperty.call(updates, key);
}

function buildNextProjectScaffold(project, updates, nextName) {
	const scaffoldUpdates = {};

	for (const key of [
		'description',
		'version',
		'javaPackageName',
		'javaMainClass',
		'javaVersion',
		'javaGroupId',
		'javaArtifactId',
	]) {
		if (hasOwnUpdateValue(updates, key)) {
			scaffoldUpdates[key] = updates[key];
		}
	}

	return resolveProjectScaffold(
		{
			name: nextName,
			frontend: project.frontend,
			backend: project.backend,
			scaffold: {
				...(project.scaffold || {}),
				...scaffoldUpdates,
			},
		},
		project,
	);
}

async function updateJsonFileIfPresent(filePath, updater) {
	if (!(await fs.pathExists(filePath))) {
		return;
	}

	const value = await fs.readJson(filePath);
	const nextValue = updater(value) || value;
	await fs.writeJson(filePath, nextValue, { spaces: 2 });
}

async function updateTextFileIfPresent(filePath, updater) {
	if (!(await fs.pathExists(filePath))) {
		return;
	}

	const current = await fs.readFile(filePath, 'utf8');
	const next = updater(current);
	if (typeof next === 'string' && next !== current) {
		await fs.writeFile(filePath, next);
	}
}

function replaceJavaPackageLine(content, nextPackage) {
	const packageLine = `package ${nextPackage};`;
	if (/^\s*package\s+[^;]+;/m.test(content)) {
		return content.replace(/^\s*package\s+[^;]+;/m, packageLine);
	}

	return `${packageLine}\n\n${content}`;
}

async function syncJavaSourceFile(
	projectPath,
	backendKind,
	oldScaffold,
	nextScaffold,
	projectName,
	backendPort,
) {
	const mavenLayout = backendKind === 'java-maven';
	const oldRelativePath = getJavaSourceRelativePath(oldScaffold, {
		mavenLayout,
	});
	const nextRelativePath = getJavaSourceRelativePath(nextScaffold, {
		mavenLayout,
	});
	const backendRoot = getBackendWorkspacePath(projectPath, backendKind);
	const oldSourcePath = path.join(backendRoot, oldRelativePath);
	const nextSourcePath = path.join(backendRoot, nextRelativePath);

	let activeSourcePath = nextSourcePath;
	if (
		oldSourcePath !== nextSourcePath &&
		(await fs.pathExists(oldSourcePath))
	) {
		await fs.mkdirp(path.dirname(nextSourcePath));
		await fs.move(oldSourcePath, nextSourcePath, { overwrite: true });
	}

	if (!(await fs.pathExists(activeSourcePath))) {
		activeSourcePath = oldSourcePath;
	}

	await updateTextFileIfPresent(activeSourcePath, (content) => {
		let nextContent = replaceJavaPackageLine(
			content,
			nextScaffold.javaPackageName,
		);
		nextContent = nextContent.replace(
			new RegExp(`public class\\s+${oldScaffold.javaMainClass}\\b`),
			`public class ${nextScaffold.javaMainClass}`,
		);
		nextContent = nextContent.replace(
			/private static final String PROJECT_NAME = ".*";/,
			`private static final String PROJECT_NAME = ${JSON.stringify(projectName)};`,
		);

		if (backendKind === 'java') {
			nextContent = nextContent.replace(
				/private static final int DEFAULT_PORT = \d+;/,
				`private static final int DEFAULT_PORT = ${backendPort};`,
			);
		}

		return nextContent;
	});
}

async function syncPyProjectMetadata(filePath, scaffold) {
	await updateTextFileIfPresent(filePath, (content) => {
		let nextContent = content.replace(
			/^name = ".*"$/m,
			`name = "${scaffold.projectSlug}"`,
		);
		nextContent = nextContent.replace(
			/^version = ".*"$/m,
			`version = "${scaffold.version}"`,
		);
		nextContent = nextContent.replace(
			/^description = ".*"$/m,
			`description = "${scaffold.description.replace(/"/g, '\\"')}"`,
		);
		nextContent = nextContent.replace(
			/^\[project\.scripts\][\s\S]*?^([A-Za-z0-9_-]+) = "app\.cli:main"$/m,
			`[project.scripts]\n${scaffold.projectSlug} = "app.cli:main"`,
		);
		return nextContent;
	});
}

async function syncGeneratedProjectFiles(
	projectPath,
	previousProject,
	nextProject,
) {
	const previousScaffold = getProjectScaffold(previousProject);
	const nextScaffold = getProjectScaffold(nextProject);
	const backendDefinition = getBackendTemplateDefinition(nextProject.backend);

	if (nextProject.frontend) {
		await applyFrontendMetadata(
			path.join(projectPath, 'frontend'),
			nextProject.name,
			nextScaffold,
		);
	}

	if (!nextProject.backend || !backendDefinition) {
		return;
	}

	const backendPath = getBackendWorkspacePath(
		projectPath,
		nextProject.backend,
	);

	if (backendDefinition.kind === 'node') {
		await updateJsonFileIfPresent(
			path.join(backendPath, 'package.json'),
			(value) => ({
				...value,
				name: nextScaffold.projectSlug,
				version: nextScaffold.version,
				description: nextScaffold.description,
			}),
		);
	}

	if (backendDefinition.kind === 'python-cli') {
		await syncPyProjectMetadata(
			path.join(backendPath, 'pyproject.toml'),
			nextScaffold,
		);
	}

	if (
		backendDefinition.kind === 'java' ||
		backendDefinition.kind === 'java-console' ||
		backendDefinition.kind === 'java-maven'
	) {
		await syncJavaSourceFile(
			projectPath,
			backendDefinition.kind,
			previousScaffold,
			nextScaffold,
			nextProject.name,
			nextProject.backendPort,
		);
	}

	if (backendDefinition.kind === 'java-maven') {
		await fs.writeFile(
			path.join(backendPath, 'pom.xml'),
			buildMavenPomContent(nextProject.name, nextScaffold),
		);
	}
}

// ---------- Update Project ----------
/**
 * Applies metadata, port, database, and filesystem updates to an existing project.
 *
 * @param {string} oldName - Existing project name used to locate the project.
 * @param {{name?: string, frontendPort?: string | number, backendPort?: string | number, databaseId?: string | null, projectLocation?: string, scaffold?: object, description?: string, version?: string, projectSlug?: string, javaGroupId?: string, javaPackageName?: string, javaMainClass?: string, javaArtifactId?: string, javaVersion?: string}} updates - Partial project updates from the client.
 * @returns {Promise<object>} Updated decorated project record.
 */
async function updateProject(oldName, updates) {
	const projects = loadProjects();
	const project = findProject(projects, oldName);
	if (!project) throw new Error('Project not found');
	const previousProject = JSON.parse(JSON.stringify(project));
	const projectIndex = projects.findIndex((p) => p.name === project.name);
	const oldNameValue = project.name;
	const oldFrontendPort = project.frontendPort;
	const oldBackendPort = project.backendPort;
	const nextName = updates.name ? updates.name.trim() : project.name;
	if (!nextName) {
		throw new Error('Project name is required');
	}
	const currentProjectPath = getProjectPath(project);
	const nextProjectPath = buildProjectPath(
		nextName,
		Object.prototype.hasOwnProperty.call(updates, 'projectLocation')
			? updates.projectLocation
			: getProjectLocation(project),
	);
	const nextScaffold = buildNextProjectScaffold(project, updates, nextName);

	// Validate new name
	if (updates.name && updates.name.trim() !== project.name) {
		if (
			projects.some(
				(p) => p.name.toLowerCase() === nextName.toLowerCase(),
			)
		) {
			throw new Error('Name already exists');
		}
	}

	if (
		!pathsEqual(currentProjectPath, nextProjectPath) &&
		isPathInside(nextProjectPath, currentProjectPath)
	) {
		throw new Error('Project folder cannot be moved inside itself');
	}

	if (
		!pathsEqual(currentProjectPath, nextProjectPath) &&
		(await fs.pathExists(nextProjectPath))
	) {
		throw new Error('Destination project folder already exists');
	}

	const nextPorts = validateProjectPorts({
		frontend: project.frontend,
		backend: project.backend,
		frontendPort:
			typeof updates.frontendPort !== 'undefined'
				? updates.frontendPort
				: project.frontendPort,
		backendPort:
			typeof updates.backendPort !== 'undefined'
				? updates.backendPort
				: project.backendPort,
		excludeProjectName: oldNameValue,
		currentFrontendPort: oldFrontendPort,
		currentBackendPort: oldBackendPort,
	});

	let linkedDatabase = null;
	if (typeof updates.databaseId !== 'undefined' && updates.databaseId) {
		linkedDatabase = getDatabaseById(updates.databaseId);
		if (!linkedDatabase) {
			throw new Error('Database not found');
		}
	}

	const wasRunning = getRunningServices(oldNameValue).length > 0;

	if (wasRunning) {
		await stopProject(oldNameValue);
	}

	if (!pathsEqual(currentProjectPath, nextProjectPath)) {
		await fs.mkdirp(path.dirname(nextProjectPath));
		await fs.move(currentProjectPath, nextProjectPath);
	}

	// Update metadata
	if (updates.name) project.name = nextName;
	if (typeof updates.frontendPort !== 'undefined' && project.frontend)
		project.frontendPort = nextPorts.frontendPort;
	if (typeof updates.backendPort !== 'undefined' && project.backend)
		project.backendPort = nextPorts.backendPort;
	project.projectPath = nextProjectPath;
	project.scaffold = nextScaffold;
	if (typeof updates.databaseId !== 'undefined') {
		project.databaseId = updates.databaseId || null;
	}

	projects[projectIndex] = project;
	saveProjects(projects);

	if (updates.name && nextName !== oldNameValue) {
		renameProjectTasks(oldNameValue, nextName);
		renameProjectMonitoringState(oldNameValue, nextName);
	}
	if (!pathsEqual(currentProjectPath, nextProjectPath)) {
		invalidateProjectWorkspaceMetrics(project.name);
	}

	// Update config files for port changes
	const projectPath = getProjectPath(project);
	const backendDefinition = getBackendTemplateDefinition(project.backend);
	await syncGeneratedProjectFiles(projectPath, previousProject, project);
	if (
		project.frontend &&
		updates.frontendPort &&
		parseInt(updates.frontendPort) !== oldFrontendPort
	) {
		const configPath = path.join(projectPath, 'frontend', 'vite.config.js');
		if (await fs.pathExists(configPath)) {
			let content = await fs.readFile(configPath, 'utf8');
			content = content.replace(
				/port:\s*\d+/,
				`port: ${project.frontendPort}`,
			);
			await fs.writeFile(configPath, content);
		}
	}
	if (
		project.backend &&
		updates.backendPort &&
		parseInt(updates.backendPort) !== oldBackendPort
	) {
		if (backendDefinition?.kind === 'node') {
			const indexPath = path.join(projectPath, 'backend', 'index.js');
			if (await fs.pathExists(indexPath)) {
				let content = await fs.readFile(indexPath, 'utf8');
				content = content.replace(
					/const PORT = process\.env\.PORT \|\| \d+/,
					`const PORT = process.env.PORT || ${project.backendPort}`,
				);
				await fs.writeFile(indexPath, content);
			}
		}

		if (backendDefinition?.kind === 'python') {
			const appPath = path.join(projectPath, 'backend', 'app.py');
			if (await fs.pathExists(appPath)) {
				let content = await fs.readFile(appPath, 'utf8');
				content = content.replace(
					/DEFAULT_PORT = \d+/,
					`DEFAULT_PORT = ${project.backendPort}`,
				);
				await fs.writeFile(appPath, content);
			}
		}

		if (backendDefinition?.kind === 'java') {
			const javaPath = path.join(
				projectPath,
				'backend',
				getJavaSourceRelativePath(getProjectScaffold(project)),
			);
			if (await fs.pathExists(javaPath)) {
				let content = await fs.readFile(javaPath, 'utf8');
				content = content.replace(
					/private static final int DEFAULT_PORT = \d+;/,
					`private static final int DEFAULT_PORT = ${project.backendPort};`,
				);
				await fs.writeFile(javaPath, content);
			}
		}
	}

	if (project.backend && typeof updates.databaseId !== 'undefined') {
		const envPath = path.join(
			getBackendWorkspacePath(projectPath, project.backend),
			'.env',
		);
		let envContent = '';

		if (linkedDatabase) {
			const connectionString = getConnectionString(linkedDatabase);
			envContent =
				linkedDatabase.type === 'mongodb'
					? `MONGO_URL=${connectionString}`
					: `DATABASE_URL=${connectionString}`;
		}

		await fs.writeFile(envPath, envContent);
	}

	// Restart project if it was running
	if (wasRunning) {
		await startProject(project.name);
	}

	return decorateProject(project);
}

// ---------- Delete Project ----------
/**
 * Deletes a project workspace, metadata, and optionally its remote repository.
 *
 * @param {string} name - Project name to delete.
 * @param {{deleteRemote?: boolean}} [options={}] - Whether the linked remote repository should also be removed.
 * @returns {Promise<boolean>} True when the project was deleted.
 */
async function deleteProject(name, options = {}) {
	const projects = loadProjects();
	const project = findProject(projects, name);
	if (!project) throw new Error('Project not found');
	const projectIndex = projects.findIndex((p) => p.name === project.name);
	const shouldDeleteRemote = options.deleteRemote === true;

	if (shouldDeleteRemote) {
		await deleteProjectRepository(project);
	}

	// Stop processes if running
	if (processes[project.name]) {
		await stopProject(project.name);
	}

	// Remove folder
	await fs.remove(getProjectPath(project));

	// Remove metadata
	projects.splice(projectIndex, 1);
	saveProjects(projects);
	deleteTasksForProject(project.name);
	clearProjectMonitoringState(project.name);
	return true;
}

/**
 * Publishes a local-only project repository to GitHub.
 *
 * @param {string} name - Project name to publish.
 * @returns {Promise<object>} Decorated project record with connected repository metadata.
 */
async function publishProject(name) {
	const projects = loadProjects();
	const project = findProject(projects, name);
	if (!project) throw new Error('Project not found');

	if (project.repository?.status === 'connected') {
		throw new Error('This project is already published to GitHub.');
	}

	if (project.repository?.status !== 'local-only') {
		throw new Error('Only local-only projects can be published from here.');
	}

	project.repository = await publishProjectRepository(project, {
		projectPath: getProjectPath(project),
	});
	saveProjects(projects);

	return decorateProject(project);
}

/**
 * Builds an application connection string for a linked database record.
 *
 * @param {object | null | undefined} db - Linked database record.
 * @returns {string} Database connection string, or an empty string when no credentials are available.
 */
function getConnectionString(db) {
	if (!db || !db.credentials) return '';
	switch (db.type) {
		case 'postgres':
			return `postgresql://${db.credentials.user}:${db.credentials.password}@${db.credentials.host}:${db.credentials.port}/${db.credentials.database}`;
		case 'mysql':
			return `mysql://${db.credentials.user}:${db.credentials.password}@${db.credentials.host}:${db.credentials.port}/${db.credentials.database}`;
		case 'mongodb':
			return `mongodb://${db.credentials.host}:${db.credentials.port}/${db.credentials.database}`;
		default:
			return '';
	}
}

function shouldUseProjectRootForBackend(template) {
	const backendDefinition = getBackendTemplateDefinition(template);
	return (
		backendDefinition?.kind === 'java-console' ||
		backendDefinition?.kind === 'java-maven'
	);
}

function getBackendWorkspacePath(projectPath, template) {
	if (!shouldUseProjectRootForBackend(template)) {
		return path.join(projectPath, 'backend');
	}

	const legacyBackendPath = path.join(projectPath, 'backend');
	return fs.existsSync(legacyBackendPath) ? legacyBackendPath : projectPath;
}

// ---------- Export ----------
module.exports = {
	createProject,
	createProjectWithStream: createProjectWithStreamSafe,
	getProject,
	getAllProjects,
	publishProject,
	updateProject,
	deleteProject,
	getConnectionString,
};
