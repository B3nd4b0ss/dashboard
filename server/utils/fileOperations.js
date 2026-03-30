const fs = require('fs-extra');
const {
	DATA_FILE,
	DATABASES_FILE,
	TASKS_FILE,
	MEMBERS_FILE,
	SETTINGS_FILE,
} = require('../config/constants');

/**
 * Loads the stored project list from disk.
 *
 * @returns {Array<object>} Persisted projects, or an empty array when the file does not exist yet.
 */
function loadProjects() {
	if (!fs.existsSync(DATA_FILE)) return [];
	return fs.readJsonSync(DATA_FILE);
}

/**
 * Persists the full project list back to disk.
 *
 * @param {Array<object>} projects - Complete project collection to save.
 * @returns {void}
 */
function saveProjects(projects) {
	fs.writeJsonSync(DATA_FILE, projects, { spaces: 2 });
}

/**
 * Loads the stored database definitions from disk.
 *
 * @returns {Array<object>} Persisted databases, or an empty array when nothing has been saved yet.
 */
function loadDatabases() {
	if (!fs.existsSync(DATABASES_FILE)) return [];
	return fs.readJsonSync(DATABASES_FILE);
}

/**
 * Persists the full database collection back to disk.
 *
 * @param {Array<object>} databases - Complete database collection to save.
 * @returns {void}
 */
function saveDatabases(databases) {
	fs.writeJsonSync(DATABASES_FILE, databases, { spaces: 2 });
}

/**
 * Loads the stored task records from disk.
 *
 * @returns {Array<object>} Persisted tasks, or an empty array when the task store is missing.
 */
function loadTasks() {
	if (!fs.existsSync(TASKS_FILE)) return [];
	return fs.readJsonSync(TASKS_FILE);
}

/**
 * Persists the full task collection back to disk.
 *
 * @param {Array<object>} tasks - Complete task collection to save.
 * @returns {void}
 */
function saveTasks(tasks) {
	fs.writeJsonSync(TASKS_FILE, tasks, { spaces: 2 });
}

/**
 * Loads the stored team member records from disk.
 *
 * @returns {Array<object>} Persisted members, or an empty array when the member store is missing.
 */
function loadMembers() {
	if (!fs.existsSync(MEMBERS_FILE)) return [];
	return fs.readJsonSync(MEMBERS_FILE);
}

/**
 * Persists the full member collection back to disk.
 *
 * @param {Array<object>} members - Complete member collection to save.
 * @returns {void}
 */
function saveMembers(members) {
	fs.writeJsonSync(MEMBERS_FILE, members, { spaces: 2 });
}

/**
 * Loads the saved dashboard settings from disk.
 *
 * @returns {object} Persisted settings, or an empty object when settings have not been saved yet.
 */
function loadSettings() {
	if (!fs.existsSync(SETTINGS_FILE)) return {};
	return fs.readJsonSync(SETTINGS_FILE);
}

/**
 * Persists dashboard settings back to disk.
 *
 * @param {object} settings - Normalized settings object to save.
 * @returns {void}
 */
function saveSettings(settings) {
	fs.writeJsonSync(SETTINGS_FILE, settings, { spaces: 2 });
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
	loadSettings,
	saveSettings,
};
