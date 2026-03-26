const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data.json');
const DATABASES_FILE = path.join(__dirname, '../../databases.json');
const TASKS_FILE = path.join(__dirname, '../../tasks.json');
const MEMBERS_FILE = path.join(__dirname, '../../members.json');
const PROJECTS_DIR = path.join(__dirname, '../../projects');
const DOCKER_STACKS_DIR = path.join(__dirname, '../../docker-stacks');

module.exports = {
	DATA_FILE,
	DATABASES_FILE,
	TASKS_FILE,
	MEMBERS_FILE,
	PROJECTS_DIR,
	DOCKER_STACKS_DIR,
	PORT: 4000,
};
