const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const { loadProjects, saveProjects } = require('../utils/fileOperations');
const { findProject } = require('../utils/helpers');
const { PROJECTS_DIR } = require('../config/constants');
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
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function spawnHidden(command, args, options = {}) {
	return spawn(command, args, {
		shell: false,
		windowsHide: true,
		...options,
	});
}

function decorateProject(project, taskSummaryMap = null) {
	const result = { ...project };

	if (project.databaseId) {
		const db = getDatabaseById(project.databaseId);
		if (db) {
			result.database = db;
		}
	}

	const runtime = getProjectRuntimeSnapshot(project);
	result.runtime = runtime;
	result.status = runtime.status;
	result.frontendUrl = runtime.services.frontend?.url || null;
	result.backendUrl = runtime.services.backend?.url || null;
	result.projectPath = path.join(PROJECTS_DIR, project.name);
	result.taskSummary =
		taskSummaryMap?.get(project.name.toLowerCase()) ||
		getProjectTaskSummary(project.name);

	return result;
}

function resolveProjectPorts({ frontend, backend, frontendPort, backendPort }) {
	const resolvedFrontendPort = frontend
		? normalizePort(frontendPort, 'Frontend port')
		: null;
	const resolvedBackendPort = backend
		? normalizePort(backendPort, 'Backend port')
		: null;

	if (frontend && backend && resolvedFrontendPort === resolvedBackendPort) {
		throw new Error('Frontend and backend ports must be different');
	}

	return {
		frontendPort: resolvedFrontendPort,
		backendPort: resolvedBackendPort,
	};
}

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

	if (frontend && resolvedPorts.frontendPort !== currentFrontendPort) {
		assertPortAvailable(resolvedPorts.frontendPort, {
			label: 'Frontend port',
			excludeProjectName,
		});
	}

	if (backend && resolvedPorts.backendPort !== currentBackendPort) {
		assertPortAvailable(resolvedPorts.backendPort, {
			label: 'Backend port',
			excludeProjectName,
		});
	}

	return resolvedPorts;
}

// ---------- Basic Project Operations ----------
function getAllProjects() {
	const projects = loadProjects();
	const taskSummaryMap = getProjectTaskSummaryMap();
	return projects.map((project) => decorateProject(project, taskSummaryMap));
}

function getProject(name) {
	const projects = loadProjects();
	const project = findProject(projects, name);
	if (!project) return null;
	return decorateProject(project);
}

async function createProject(data) {
	const { name, frontend, backend, databaseId, frontendPort, backendPort } =
		data;
	const projects = loadProjects();
	const trimmedName = name.trim();

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

	const resolvedPorts = validateProjectPorts({
		frontend,
		backend,
		frontendPort,
		backendPort,
	});

	const newProject = {
		name: trimmedName,
		frontend: frontend || null,
		backend: backend || null,
		databaseId: linkedDatabase ? linkedDatabase.id : null,
		frontendPort: resolvedPorts.frontendPort,
		backendPort: resolvedPorts.backendPort,
		status: 'stopped',
	};

	projects.push(newProject);
	saveProjects(projects);

	const projectPath = path.join(PROJECTS_DIR, trimmedName);
	await fs.mkdirp(projectPath);

	// Create frontend
	if (frontend === 'vite-react') {
		await createFrontend(
			projectPath,
			trimmedName,
			resolvedPorts.frontendPort,
		);
	}

	// Create backend
	if (backend === 'node') {
		await createBackend(
			projectPath,
			trimmedName,
			resolvedPorts.backendPort,
		);
	}

	// Create .env if database linked
	if (linkedDatabase && backend === 'node') {
		const envPath = path.join(projectPath, 'backend', '.env');
		await fs.writeFile(
			envPath,
			`DATABASE_URL=postgresql://${linkedDatabase.credentials.user}:${linkedDatabase.credentials.password}@${linkedDatabase.credentials.host}:${linkedDatabase.credentials.port}/${linkedDatabase.credentials.database}`,
		);
	}

	return newProject;
}

// ---------- Streaming Project Creation ----------
async function createProjectWithStream(data, eventEmitter) {
	const { name, frontend, backend, databaseId, frontendPort, backendPort } =
		data;
	const projects = loadProjects();
	const trimmedName = name.trim();

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

	const newProject = {
		name: trimmedName,
		frontend: frontend || null,
		backend: backend || null,
		databaseId: linkedDatabase ? linkedDatabase.id : null,
		frontendPort: resolvedPorts.frontendPort,
		backendPort: resolvedPorts.backendPort,
		status: 'stopped',
	};

	projects.push(newProject);
	saveProjects(projects);

	const projectPath = path.join(PROJECTS_DIR, trimmedName);
	await fs.mkdirp(projectPath);

	// Create frontend
	if (frontend === 'vite-react') {
		eventEmitter.emit('log', '📦 Creating Vite React frontend...');
		await createFrontendWithStream(
			projectPath,
			trimmedName,
			resolvedPorts.frontendPort,
			eventEmitter,
		);
	}

	// Create backend
	if (backend === 'node') {
		eventEmitter.emit('log', '📦 Creating Node.js backend...');
		await createBackendWithStream(
			projectPath,
			trimmedName,
			resolvedPorts.backendPort,
			eventEmitter,
			linkedDatabase,
		);
	}

	// Create .env if database linked
	if (linkedDatabase && backend === 'node') {
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
	eventEmitter.emit('complete', newProject);
	return newProject;
}

// ---------- Frontend Creation ----------
async function createFrontend(projectPath, name, port) {
	const frontendPath = path.join(projectPath, 'frontend');
	await fs.mkdirp(frontendPath);

	await new Promise((resolve, reject) => {
		const proc = spawnHidden(
			NPM_COMMAND,
			['create', 'vite@latest', '.', '--', '--template', 'react'],
			{
				cwd: frontendPath,
				stdio: 'inherit',
			},
		);
		proc.on('close', resolve);
		proc.on('error', reject);
	});

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
		const installProc = spawnHidden(NPM_COMMAND, ['install'], {
			cwd: frontendPath,
			stdio: 'inherit',
		});
		installProc.on('close', resolve);
		installProc.on('error', reject);
	});
}

async function createFrontendWithStream(projectPath, name, port, eventEmitter) {
	const frontendPath = path.join(projectPath, 'frontend');
	await fs.mkdirp(frontendPath);

	eventEmitter.emit('log', '  ⚡ Creating Vite project...');

	await new Promise((resolve, reject) => {
		const proc = spawnHidden(
			NPM_COMMAND,
			['create', 'vite@latest', '.', '--', '--template', 'react'],
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
		const installProc = spawnHidden(NPM_COMMAND, ['install'], {
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
async function createBackend(projectPath, name, port) {
	const backendPath = path.join(projectPath, 'backend');
	await fs.mkdirp(backendPath);

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
		const installProc = spawnHidden(NPM_COMMAND, ['install'], {
			cwd: backendPath,
			stdio: 'inherit',
		});
		installProc.on('close', resolve);
		installProc.on('error', reject);
	});
}

async function createBackendWithStream(
	projectPath,
	name,
	port,
	eventEmitter,
	linkedDatabase = null,
) {
	const backendPath = path.join(projectPath, 'backend');
	await fs.mkdirp(backendPath);

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
		const installProc = spawnHidden(NPM_COMMAND, ['install'], {
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

// ---------- Update Project ----------
async function updateProject(oldName, updates) {
	const projects = loadProjects();
	const project = findProject(projects, oldName);
	if (!project) throw new Error('Project not found');
	const projectIndex = projects.findIndex((p) => p.name === project.name);
	const oldNameValue = project.name;
	const oldFrontendPort = project.frontendPort;
	const oldBackendPort = project.backendPort;
	const nextName = updates.name ? updates.name.trim() : project.name;

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

	// Update metadata
	if (updates.name) project.name = nextName;
	if (typeof updates.frontendPort !== 'undefined' && project.frontend)
		project.frontendPort = nextPorts.frontendPort;
	if (typeof updates.backendPort !== 'undefined' && project.backend)
		project.backendPort = nextPorts.backendPort;
	if (typeof updates.databaseId !== 'undefined') {
		project.databaseId = updates.databaseId || null;
	}

	projects[projectIndex] = project;
	saveProjects(projects);

	// Rename folder if name changed
	if (updates.name && nextName !== oldNameValue) {
		const oldPath = path.join(PROJECTS_DIR, oldNameValue);
		const newPath = path.join(PROJECTS_DIR, nextName);
		await fs.move(oldPath, newPath);
		renameProjectTasks(oldNameValue, nextName);
	}

	// Update config files for port changes
	const projectPath = path.join(PROJECTS_DIR, project.name);
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

	if (project.backend && typeof updates.databaseId !== 'undefined') {
		const envPath = path.join(projectPath, 'backend', '.env');
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
async function deleteProject(name) {
	const projects = loadProjects();
	const project = findProject(projects, name);
	if (!project) throw new Error('Project not found');
	const projectIndex = projects.findIndex((p) => p.name === project.name);

	// Stop processes if running
	if (processes[project.name]) {
		await stopProject(project.name);
	}

	// Remove folder
	await fs.remove(path.join(PROJECTS_DIR, project.name));

	// Remove metadata
	projects.splice(projectIndex, 1);
	saveProjects(projects);
	deleteTasksForProject(project.name);
	return true;
}

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

// ---------- Export ----------
module.exports = {
	createProject,
	createProjectWithStream,
	getProject,
	getAllProjects,
	updateProject,
	deleteProject,
	getConnectionString,
};
