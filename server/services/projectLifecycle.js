const { spawn } = require('child_process');
const path = require('path');
const kill = require('tree-kill');
const { PROJECTS_DIR } = require('../config/constants');
const { loadProjects, saveProjects } = require('../utils/fileOperations');
const { findProject } = require('../utils/helpers');
const { startContainer, stopContainer } = require('./docker');
const { getDatabaseById } = require('./databaseService');

let processes = {};

async function startProject(name) {
	const projects = loadProjects();
	const project = findProject(projects, name);
	if (!project) throw new Error('Project not found');
	if (
		processes[project.name] &&
		Object.keys(processes[project.name]).length > 0
	) {
		return { message: 'Already running' };
	}

	const projectPath = path.join(PROJECTS_DIR, project.name);
	const running = {};

	// Start database if present
	if (project.databaseId) {
		const db = getDatabaseById(project.databaseId);
		if (db && db.containerName) {
			await startContainer(db.containerName);
		}
	}

	// Start frontend
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

	// Start backend
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
	return { message: 'Started' };
}

async function stopProject(name) {
	const projects = loadProjects();
	const project = findProject(projects, name);
	if (!project) throw new Error('Project not found');

	const running = processes[project.name];
	if (running) {
		if (running.frontend) kill(running.frontend.pid, 'SIGTERM');
		if (running.backend) kill(running.backend.pid, 'SIGTERM');
		delete processes[project.name];
	}

	// Stop database container
	if (project.databaseId) {
		const db = getDatabaseById(project.databaseId);
		if (db && db.containerName) {
			await stopContainer(db.containerName);
		}
	}

	project.status = 'stopped';
	saveProjects(projects);
	return { message: 'Stopped' };
}

module.exports = {
	startProject,
	stopProject,
	processes,
};
