const { loadDatabases, saveDatabases } = require('../utils/fileOperations');
const { generateId } = require('../utils/helpers');
const {
	createPostgresContainer,
	createAdminerContainer,
	removeContainer,
	startContainer,
	stopContainer,
	getContainerStatus,
} = require('./docker');

async function createDatabase(name, type, port, withClient = false) {
	if (type !== 'postgres') throw new Error('Only PostgreSQL supported');

	const databases = loadDatabases();
	if (databases.find((db) => db.name === name))
		throw new Error('Name exists');

	const usedPorts = databases.map((db) => db.port);
	let dbPort = port ? parseInt(port) : 5432;
	while (usedPorts.includes(dbPort)) dbPort++;
	if (port && usedPorts.includes(dbPort))
		throw new Error('Port already in use');

	// Create database container
	const containerName = await createPostgresContainer(
		name,
		dbPort,
		`${name}pass`,
	);

	// Create client container if requested
	let clientContainerName = null;
	let clientPort = null;
	if (withClient) {
		clientPort = dbPort + 1000;
		while (usedPorts.includes(clientPort)) clientPort++;
		if (clientPort > 65535) throw new Error('No free port for Adminer');
		clientContainerName = await createAdminerContainer(
			containerName,
			clientPort,
		);
	}

	const newDatabase = {
		id: generateId(),
		name,
		type,
		port: dbPort,
		containerName,
		clientContainerName,
		clientPort,
		credentials: {
			user: 'appuser',
			password: `${name}pass`,
			database: 'appdb',
			host: 'localhost',
			port: dbPort,
		},
		createdAt: new Date().toISOString(),
	};
	databases.push(newDatabase);
	saveDatabases(databases);
	return newDatabase;
}

async function deleteDatabase(id) {
	const databases = loadDatabases();
	const dbIndex = databases.findIndex((db) => db.id === id);
	if (dbIndex === -1) return false;
	const db = databases[dbIndex];
	await removeContainer(db.containerName);
	if (db.clientContainerName) await removeContainer(db.clientContainerName);
	databases.splice(dbIndex, 1);
	saveDatabases(databases);
	return true;
}

function getAllDatabases() {
	return loadDatabases();
}

function getDatabaseById(id) {
	const databases = loadDatabases();
	return databases.find((db) => db.id === id);
}

// Update startDatabaseContainer to also start client if exists
async function startDatabaseContainer(id) {
	const db = getDatabaseById(id);
	if (!db) throw new Error('Database not found');

	// Start the database container
	await startContainer(db.containerName);

	// If there's a client container, start it too
	if (db.clientContainerName) {
		try {
			await startContainer(db.clientContainerName);
		} catch (err) {
			console.error('Failed to start client container:', err);
			// Don't throw error, just log it
		}
	}
}

// Update stopDatabaseContainer to also stop client if exists
async function stopDatabaseContainer(id) {
	const db = getDatabaseById(id);
	if (!db) throw new Error('Database not found');

	// Stop the database container
	await stopContainer(db.containerName);

	// If there's a client container, stop it too
	if (db.clientContainerName) {
		try {
			await stopContainer(db.clientContainerName);
		} catch (err) {
			console.error('Failed to stop client container:', err);
			// Don't throw error, just log it
		}
	}
}

async function getDatabaseStatus(id) {
	const db = getDatabaseById(id);
	if (!db) throw new Error('Database not found');
	return await getContainerStatus(db.containerName);
}

// Keep these for manual client control
async function startClientContainer(id) {
	const db = getDatabaseById(id);
	if (!db || !db.clientContainerName) throw new Error('No client container');
	await startContainer(db.clientContainerName);
}

async function stopClientContainer(id) {
	const db = getDatabaseById(id);
	if (!db || !db.clientContainerName) throw new Error('No client container');
	await stopContainer(db.clientContainerName);
}

module.exports = {
	createDatabase,
	deleteDatabase,
	getAllDatabases,
	getDatabaseById,
	startDatabaseContainer,
	stopDatabaseContainer,
	startClientContainer,
	stopClientContainer,
	getDatabaseStatus,
};
