const path = require('path');
const dashboardConfig = require('../../dashboard.config.json');

const DATA_FILE = path.join(__dirname, '../../data.json');
const DATABASES_FILE = path.join(__dirname, '../../databases.json');
const TASKS_FILE = path.join(__dirname, '../../tasks.json');
const MEMBERS_FILE = path.join(__dirname, '../../members.json');
const SETTINGS_FILE = path.join(__dirname, '../../settings.json');
const PROJECTS_DIR = path.join(__dirname, '../../projects');
const DOCKER_STACKS_DIR = path.join(__dirname, '../../docker-stacks');
const DASHBOARD_PORTS = Object.freeze({
	backend: Number(dashboardConfig?.ports?.backend) || 4000,
	frontend: Number(dashboardConfig?.ports?.frontend) || 5173,
});

module.exports = {
	DATA_FILE,
	DATABASES_FILE,
	TASKS_FILE,
	MEMBERS_FILE,
	SETTINGS_FILE,
	PROJECTS_DIR,
	DOCKER_STACKS_DIR,
	DASHBOARD_PORTS,
	PORT: DASHBOARD_PORTS.backend,
};
