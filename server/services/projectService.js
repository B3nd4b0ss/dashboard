const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const kill = require('tree-kill');
const { loadProjects, saveProjects } = require('../utils/fileOperations');
const { findProject } = require('../utils/helpers');
const { PROJECTS_DIR } = require('../config/constants');
const { getDatabaseById } = require('./databaseService');

let processes = {};

// ---------- Basic Project Operations ----------
function getAllProjects() {
	const projects = loadProjects();
	// Add database info to each project
	return projects.map((project) => {
		if (project.databaseId) {
			const db = getDatabaseById(project.databaseId);
			if (db) project.database = db;
		}
		return project;
	});
}

function getProject(name) {
	const projects = loadProjects();
	const project = findProject(projects, name);
	if (!project) return null;
	if (project.databaseId) {
		const db = getDatabaseById(project.databaseId);
		if (db) project.database = db;
	}
	return project;
}

async function createProject(data) {
	const { name, frontend, backend, databaseId, frontendPort, backendPort } =
		data;
	const projects = loadProjects();

	if (findProject(projects, name)) {
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

	// Check port conflicts
	const usedPorts = projects.flatMap((p) =>
		[p.frontendPort, p.backendPort].filter(Boolean),
	);
	if (frontend && usedPorts.includes(parseInt(frontendPort))) {
		throw new Error('Frontend port already in use');
	}
	if (backend && usedPorts.includes(parseInt(backendPort))) {
		throw new Error('Backend port already in use');
	}
	if (frontend && backend && frontendPort === backendPort) {
		throw new Error('Frontend and backend ports must be different');
	}

	const newProject = {
		name: name.trim(),
		frontend: frontend || null,
		backend: backend || null,
		databaseId: linkedDatabase ? linkedDatabase.id : null,
		frontendPort: frontend ? parseInt(frontendPort) : null,
		backendPort: backend ? parseInt(backendPort) : null,
		status: 'stopped',
	};

	projects.push(newProject);
	saveProjects(projects);

	const projectPath = path.join(PROJECTS_DIR, name);
	await fs.mkdirp(projectPath);

	// Create frontend
	if (frontend === 'vite-react') {
		await createFrontend(projectPath, name, frontendPort);
	}

	// Create backend
	if (backend === 'node') {
		await createBackend(projectPath, name, backendPort);
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

	if (findProject(projects, name)) {
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

	// Check port conflicts
	const usedPorts = projects.flatMap((p) =>
		[p.frontendPort, p.backendPort].filter(Boolean),
	);
	if (frontend && usedPorts.includes(parseInt(frontendPort))) {
		eventEmitter.emit('error', 'Frontend port already in use');
		throw new Error('Frontend port already in use');
	}
	if (backend && usedPorts.includes(parseInt(backendPort))) {
		eventEmitter.emit('error', 'Backend port already in use');
		throw new Error('Backend port already in use');
	}
	if (frontend && backend && frontendPort === backendPort) {
		eventEmitter.emit(
			'error',
			'Frontend and backend ports must be different',
		);
		throw new Error('Frontend and backend ports must be different');
	}

	eventEmitter.emit('log', `🚀 Creating project: ${name}`);

	const newProject = {
		name: name.trim(),
		frontend: frontend || null,
		backend: backend || null,
		databaseId: linkedDatabase ? linkedDatabase.id : null,
		frontendPort: frontend ? parseInt(frontendPort) : null,
		backendPort: backend ? parseInt(backendPort) : null,
		status: 'stopped',
	};

	projects.push(newProject);
	saveProjects(projects);

	const projectPath = path.join(PROJECTS_DIR, name);
	await fs.mkdirp(projectPath);

	// Create frontend
	if (frontend === 'vite-react') {
		eventEmitter.emit('log', '📦 Creating Vite React frontend...');
		await createFrontendWithStream(
			projectPath,
			name,
			frontendPort,
			eventEmitter,
		);
	}

	// Create backend
	if (backend === 'node') {
		eventEmitter.emit('log', '📦 Creating Node.js backend...');
		await createBackendWithStream(
			projectPath,
			name,
			backendPort,
			eventEmitter,
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
		const proc = spawn(
			'npm',
			['create', 'vite@latest', '.', '--', '--template', 'react'],
			{
				cwd: frontendPath,
				stdio: 'inherit',
				shell: true,
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
		const installProc = spawn('npm', ['install'], {
			cwd: frontendPath,
			stdio: 'inherit',
			shell: true,
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
		const proc = spawn(
			'npm',
			['create', 'vite@latest', '.', '--', '--template', 'react'],
			{
				cwd: frontendPath,
				shell: true,
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
		const installProc = spawn('npm', ['install'], {
			cwd: frontendPath,
			shell: true,
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
		const installProc = spawn('npm', ['install'], {
			cwd: backendPath,
			stdio: 'inherit',
			shell: true,
		});
		installProc.on('close', resolve);
		installProc.on('error', reject);
	});
}

async function createBackendWithStream(projectPath, name, port, eventEmitter) {
	const backendPath = path.join(projectPath, 'backend');
	await fs.mkdirp(backendPath);

	eventEmitter.emit('log', '  📝 Creating Express server...');

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

	eventEmitter.emit('log', '  📦 Installing npm dependencies...');
	await new Promise((resolve, reject) => {
		const installProc = spawn('npm', ['install'], {
			cwd: backendPath,
			shell: true,
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

	// Validate new name
	if (updates.name && updates.name.trim() !== project.name) {
		const trimmedNewName = updates.name.trim();
		if (
			projects.some(
				(p) => p.name.toLowerCase() === trimmedNewName.toLowerCase(),
			)
		) {
			throw new Error('Name already exists');
		}
	}

	// Validate ports
	const usedPorts = projects
		.flatMap((p) => [p.frontendPort, p.backendPort].filter(Boolean))
		.filter(
			(port) =>
				port !== project.frontendPort && port !== project.backendPort,
		);

	if (
		updates.frontendPort &&
		project.frontend &&
		usedPorts.includes(parseInt(updates.frontendPort))
	) {
		throw new Error('Frontend port already in use');
	}
	if (
		updates.backendPort &&
		project.backend &&
		usedPorts.includes(parseInt(updates.backendPort))
	) {
		throw new Error('Backend port already in use');
	}

	const oldNameValue = project.name;
	const wasRunning =
		processes[oldNameValue] &&
		Object.keys(processes[oldNameValue]).length > 0;

	if (wasRunning) {
		// Stop project
		const running = processes[oldNameValue];
		if (running.frontend) kill(running.frontend.pid, 'SIGTERM');
		if (running.backend) kill(running.backend.pid, 'SIGTERM');
		delete processes[oldNameValue];
	}

	// Update metadata
	if (updates.name) project.name = updates.name.trim();
	if (updates.frontendPort && project.frontend)
		project.frontendPort = parseInt(updates.frontendPort);
	if (updates.backendPort && project.backend)
		project.backendPort = parseInt(updates.backendPort);
	if (updates.databaseId) project.databaseId = updates.databaseId;

	projects[projectIndex] = project;
	saveProjects(projects);

	// Rename folder if name changed
	if (updates.name && updates.name.trim() !== oldNameValue) {
		const oldPath = path.join(PROJECTS_DIR, oldNameValue);
		const newPath = path.join(PROJECTS_DIR, updates.name.trim());
		await fs.move(oldPath, newPath);
	}

	// Update config files for port changes
	const projectPath = path.join(PROJECTS_DIR, project.name);
	if (
		project.frontend &&
		updates.frontendPort &&
		updates.frontendPort !== project.frontendPort
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
		updates.backendPort !== project.backendPort
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

	// Restart project if it was running
	if (wasRunning) {
		const running = {};
		if (project.frontend) {
			const frontendPath = path.join(projectPath, 'frontend');
			const proc = spawn('npm', ['run', 'dev'], {
				cwd: frontendPath,
				stdio: 'inherit',
				shell: true,
				env: { ...process.env },
			});
			running.frontend = proc;
		}
		if (project.backend) {
			const backendPath = path.join(projectPath, 'backend');
			const proc = spawn('npm', ['run', 'dev'], {
				cwd: backendPath,
				stdio: 'inherit',
				shell: true,
				env: { ...process.env, PORT: project.backendPort },
			});
			running.backend = proc;
		}
		processes[project.name] = running;
		project.status = 'running';
		saveProjects(projects);
	}

	return project;
}

// ---------- Delete Project ----------
async function deleteProject(name) {
	const projects = loadProjects();
	const project = findProject(projects, name);
	if (!project) throw new Error('Project not found');
	const projectIndex = projects.findIndex((p) => p.name === project.name);

	// Stop processes if running
	if (processes[project.name]) {
		const running = processes[project.name];
		if (running.frontend) kill(running.frontend.pid, 'SIGTERM');
		if (running.backend) kill(running.backend.pid, 'SIGTERM');
		delete processes[project.name];
	}

	// Remove folder
	await fs.remove(path.join(PROJECTS_DIR, project.name));

	// Remove metadata
	projects.splice(projectIndex, 1);
	saveProjects(projects);
	return true;
}

// ---------- Export ----------
module.exports = {
	createProject,
	createProjectWithStream,
	getProject,
	getAllProjects,
	updateProject,
	deleteProject,
	processes,
};
