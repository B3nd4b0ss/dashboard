const fs = require('fs-extra');
const {
	DATA_FILE,
	DATABASES_FILE,
	TASKS_FILE,
	MEMBERS_FILE,
} = require('../config/constants');

function loadProjects() {
	if (!fs.existsSync(DATA_FILE)) return [];
	return fs.readJsonSync(DATA_FILE);
}

function saveProjects(projects) {
	fs.writeJsonSync(DATA_FILE, projects, { spaces: 2 });
}

function loadDatabases() {
	if (!fs.existsSync(DATABASES_FILE)) return [];
	return fs.readJsonSync(DATABASES_FILE);
}

function saveDatabases(databases) {
	fs.writeJsonSync(DATABASES_FILE, databases, { spaces: 2 });
}

function loadTasks() {
	if (!fs.existsSync(TASKS_FILE)) return [];
	return fs.readJsonSync(TASKS_FILE);
}

function saveTasks(tasks) {
	fs.writeJsonSync(TASKS_FILE, tasks, { spaces: 2 });
}

function loadMembers() {
	if (!fs.existsSync(MEMBERS_FILE)) return [];
	return fs.readJsonSync(MEMBERS_FILE);
}

function saveMembers(members) {
	fs.writeJsonSync(MEMBERS_FILE, members, { spaces: 2 });
}

module.exports = {
	loadProjects,
	saveProjects,
	loadDatabases,
	saveDatabases,
	loadTasks,
	saveTasks,
	loadMembers,
	saveMembers,
};
