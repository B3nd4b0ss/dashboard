/**
 * Finds a project by name using a case-insensitive comparison.
 *
 * @param {Array<{name: string}>} projects - Project records to search through.
 * @param {string} name - Project name supplied by the caller.
 * @returns {object | undefined} Matching project record when found.
 */
function findProject(projects, name) {
	const trimmed = name.trim();
	return projects.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
}

/**
 * Finds a database by its persisted id.
 *
 * @param {Array<{id: string}>} databases - Database records to inspect.
 * @param {string} id - Database id to match.
 * @returns {object | undefined} Matching database record when found.
 */
function findDatabase(databases, id) {
	return databases.find((db) => db.id === id);
}

/**
 * Generates a lightweight unique identifier for local records.
 *
 * @returns {string} Timestamp-based id with a random suffix.
 */
function generateId() {
	return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

module.exports = {
	findProject,
	findDatabase,
	generateId,
};
