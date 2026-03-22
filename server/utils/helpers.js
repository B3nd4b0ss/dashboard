function findProject(projects, name) {
	const trimmed = name.trim();
	return projects.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
}

function findDatabase(databases, id) {
	return databases.find((db) => db.id === id);
}

function generateId() {
	return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

module.exports = {
	findProject,
	findDatabase,
	generateId,
};
