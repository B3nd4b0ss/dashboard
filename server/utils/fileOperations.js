const fs = require('fs-extra');
const { DATA_FILE, DATABASES_FILE } = require('../config/constants');

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

module.exports = {
	loadProjects,
	saveProjects,
	loadDatabases,
	saveDatabases,
};
