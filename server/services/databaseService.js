const fs = require('fs-extra');
const path = require('path');
const { loadDatabases, saveDatabases } = require('../utils/fileOperations');
const { generateId } = require('../utils/helpers');
const {
	removeContainer,
	startContainer,
	stopContainer,
	upComposeStack,
	startComposeStack,
	stopComposeStack,
	removeComposeStack,
	getContainerStatus,
} = require('./docker');
const {
	assertPortAvailable,
	findNextAvailablePort,
} = require('./portRegistry');
const { DOCKER_STACKS_DIR } = require('../config/constants');

const SUPPORTED_DATABASE_TYPES = new Set(['postgres', 'mysql', 'mongodb']);
const DEFAULT_DATABASE_PORTS = {
	postgres: 5432,
	mysql: 3306,
	mongodb: 27017,
};

function isComposeDatabase(db) {
	return (
		db?.orchestration === 'compose' &&
		Boolean(db.composeFilePath) &&
		Boolean(db.composeProjectName)
	);
}

function getDatabaseById(id) {
	const databases = loadDatabases();
	return databases.find((db) => db.id === id);
}

function getAllDatabases() {
	return loadDatabases();
}

function resolveDatabasePort(type, port) {
	if (port) {
		return assertPortAvailable(port, { label: 'Database port' });
	}

	return findNextAvailablePort(DEFAULT_DATABASE_PORTS[type], {
		label: 'Database port',
	});
}

function resolveClientPort(databasePort) {
	const preferredClientPort = databasePort + 1000;

	if (preferredClientPort > 65535) {
		throw new Error('No safe Adminer port available');
	}

	return findNextAvailablePort(preferredClientPort, {
		label: 'Database client port',
		ignorePorts: [databasePort],
	});
}

function buildCredentials(name, type, port) {
	if (type === 'mongodb') {
		return {
			database: 'appdb',
			host: 'localhost',
			port,
		};
	}

	return {
		user: 'appuser',
		password: `${name}pass`,
		database: 'appdb',
		host: 'localhost',
		port,
	};
}

function sanitizeStackName(name) {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function buildContainerName(name) {
	return `db_${name.replace(/[^a-z0-9]/gi, '_')}`;
}

function buildClientContainerName(containerName) {
	return `client_${containerName}`;
}

function buildComposeVolumeName(projectName, suffix) {
	return `${projectName.replace(/[^a-z0-9]/gi, '_')}_${suffix}`;
}

function buildComposeConfig({
	type,
	password,
	containerName,
	clientContainerName,
	databasePort,
	clientPort,
	composeProjectName,
}) {
	const databaseService = {
		image:
			type === 'postgres'
				? 'postgres:15'
				: type === 'mysql'
					? 'mysql:8'
					: 'mongo:latest',
		container_name: containerName,
		restart: 'unless-stopped',
		ports: [`${databasePort}:${DEFAULT_DATABASE_PORTS[type]}`],
	};

	if (type === 'postgres') {
		databaseService.environment = {
			POSTGRES_PASSWORD: password,
			POSTGRES_USER: 'appuser',
			POSTGRES_DB: 'appdb',
		};
		databaseService.volumes = [
			`${buildComposeVolumeName(composeProjectName, 'postgres_data')}:/var/lib/postgresql/data`,
		];
	}

	if (type === 'mysql') {
		databaseService.environment = {
			MYSQL_ROOT_PASSWORD: password,
			MYSQL_DATABASE: 'appdb',
			MYSQL_USER: 'appuser',
			MYSQL_PASSWORD: password,
		};
		databaseService.volumes = [
			`${buildComposeVolumeName(composeProjectName, 'mysql_data')}:/var/lib/mysql`,
		];
	}

	if (type === 'mongodb') {
		databaseService.volumes = [
			`${buildComposeVolumeName(composeProjectName, 'mongo_data')}:/data/db`,
		];
	}

	const services = {
		database: databaseService,
	};

	if (clientPort && type !== 'mongodb') {
		services.client = {
			image: 'adminer:latest',
			container_name: clientContainerName,
			restart: 'unless-stopped',
			depends_on: ['database'],
			ports: [`${clientPort}:8080`],
			environment: {
				ADMINER_DEFAULT_SERVER: 'database',
			},
		};
	}

	const composeDocument = {
		name: composeProjectName,
		services,
	};

	const usedVolumes = Object.values(services)
		.flatMap((service) => service.volumes || [])
		.map((volume) => volume.split(':')[0])
		.filter(Boolean);

	if (usedVolumes.length > 0) {
		composeDocument.volumes = Object.fromEntries(
			usedVolumes.map((volumeName) => [volumeName, {}]),
		);
	}

	return `${serializeYaml(composeDocument)}\n`;
}

function formatYamlScalar(value) {
	if (typeof value === 'string') {
		return JSON.stringify(value);
	}

	return String(value);
}

function serializeYaml(value, indentLevel = 0) {
	const indent = '  '.repeat(indentLevel);

	if (Array.isArray(value)) {
		return value
			.map((item) => {
				if (item && typeof item === 'object' && !Array.isArray(item)) {
					return `${indent}-\n${serializeYaml(item, indentLevel + 1)}`;
				}

				return `${indent}- ${formatYamlScalar(item)}`;
			})
			.join('\n');
	}

	if (value && typeof value === 'object') {
		return Object.entries(value)
			.map(([key, entryValue]) => {
				if (
					entryValue &&
					typeof entryValue === 'object' &&
					!Array.isArray(entryValue)
				) {
					return `${indent}${key}:\n${serializeYaml(
						entryValue,
						indentLevel + 1,
					)}`;
				}

				if (Array.isArray(entryValue)) {
					return `${indent}${key}:\n${serializeYaml(
						entryValue,
						indentLevel + 1,
					)}`;
				}

				return `${indent}${key}: ${formatYamlScalar(entryValue)}`;
			})
			.join('\n');
	}

	return `${indent}${formatYamlScalar(value)}`;
}

function assertDatabaseIdentifiersAvailable(
	databases,
	containerName,
	clientContainerName,
	composeProjectName,
	stackDirectory,
) {
	const normalizedStackDirectory = path.resolve(stackDirectory);

	const hasCollision = databases.some((db) => {
		const existingStackDirectory = db.stackDirectory
			? path.resolve(db.stackDirectory)
			: null;

		return (
			db.containerName === containerName ||
			(clientContainerName &&
				db.clientContainerName === clientContainerName) ||
			db.composeProjectName === composeProjectName ||
			existingStackDirectory === normalizedStackDirectory
		);
	});

	if (hasCollision) {
		throw new Error(
			'This name would reuse an existing Docker stack or container name. Pick a more distinct database name.',
		);
	}
}

async function ensureComposeFileExists(db) {
	const composeFilePath = db.composeFilePath;

	if (!(await fs.pathExists(composeFilePath))) {
		throw new Error(
			`Docker Compose file not found for ${db.name}. Expected ${composeFilePath}`,
		);
	}
}

async function createDatabaseInternal({
	name,
	type,
	port,
	withClient = false,
	onLog = () => {},
}) {
	const trimmedName = name.trim();
	if (!trimmedName) {
		throw new Error('Name required');
	}

	if (!SUPPORTED_DATABASE_TYPES.has(type)) {
		throw new Error(`Unsupported database type: ${type}`);
	}

	onLog(`Preparing ${type} database "${trimmedName}"...`);

	const databases = loadDatabases();
	if (databases.find((db) => db.name === trimmedName)) {
		throw new Error('Name exists');
	}

	const stackSlug = sanitizeStackName(trimmedName);
	if (!stackSlug) {
		throw new Error('Name must include at least one letter or number');
	}

	const databasePort = resolveDatabasePort(type, port);
	const clientPort =
		withClient && type !== 'mongodb'
			? resolveClientPort(databasePort)
			: null;
	onLog(`Reserved database port ${databasePort}.`);
	if (clientPort) {
		onLog(`Reserved Adminer port ${clientPort}.`);
	}
	const password = `${trimmedName}pass`;
	const containerName = buildContainerName(trimmedName);
	const clientContainerName = clientPort
		? buildClientContainerName(containerName)
		: null;
	const composeProjectName = `stack-${stackSlug}`;
	const stackDirectory = path.join(DOCKER_STACKS_DIR, stackSlug);
	const composeFilePath = path.join(stackDirectory, 'docker-compose.yml');

	assertDatabaseIdentifiersAvailable(
		databases,
		containerName,
		clientContainerName,
		composeProjectName,
		stackDirectory,
	);

	try {
		onLog('Creating Docker Compose stack directory...');
		await fs.ensureDir(stackDirectory);
		onLog('Writing docker-compose.yml...');
		await fs.writeFile(
			composeFilePath,
			buildComposeConfig({
				type,
				password,
				containerName,
				clientContainerName,
				databasePort,
				clientPort,
				composeProjectName,
			}),
		);
		onLog('Starting Docker Compose services...');
		await upComposeStack(composeFilePath, composeProjectName);
		onLog('Database stack started successfully.');
	} catch (error) {
		try {
			if (await fs.pathExists(composeFilePath)) {
				await removeComposeStack(composeFilePath, composeProjectName);
			}
		} catch (cleanupError) {
			console.error('Failed to clean up compose stack:', cleanupError);
		}
		await fs.remove(stackDirectory);
		throw error;
	}

	const newDatabase = {
		id: generateId(),
		name: trimmedName,
		type,
		port: databasePort,
		containerName,
		clientContainerName,
		clientPort,
		composeProjectName,
		composeFilePath,
		stackDirectory,
		orchestration: 'compose',
		credentials: buildCredentials(trimmedName, type, databasePort),
		createdAt: new Date().toISOString(),
	};

	databases.push(newDatabase);
	saveDatabases(databases);
	return newDatabase;
}

async function createDatabase(name, type, port, withClient = false) {
	return createDatabaseInternal({
		name,
		type,
		port,
		withClient,
	});
}

async function createDatabaseWithStream(data, eventEmitter) {
	try {
		const database = await createDatabaseInternal({
			...data,
			onLog: (message) => eventEmitter.emit('log', message),
		});
		eventEmitter.emit('log', 'Database created successfully.');
		eventEmitter.emit('complete', database);
		return database;
	} catch (error) {
		eventEmitter.emit('error', error.message);
		throw error;
	}
}

async function deleteDatabase(id) {
	const databases = loadDatabases();
	const dbIndex = databases.findIndex((db) => db.id === id);

	if (dbIndex === -1) {
		return false;
	}

	const db = databases[dbIndex];
	if (isComposeDatabase(db)) {
		if (await fs.pathExists(db.composeFilePath)) {
			await removeComposeStack(db.composeFilePath, db.composeProjectName);
		}
		await fs.remove(db.stackDirectory || path.dirname(db.composeFilePath));
	} else {
		await removeContainer(db.containerName);

		if (db.clientContainerName) {
			await removeContainer(db.clientContainerName);
		}
	}

	databases.splice(dbIndex, 1);
	saveDatabases(databases);
	return true;
}

async function startDatabaseContainer(id) {
	const db = getDatabaseById(id);
	if (!db) throw new Error('Database not found');

	if (isComposeDatabase(db)) {
		await ensureComposeFileExists(db);
		assertPortAvailable(db.port, {
			label: 'Database port',
			excludeDatabaseId: db.id,
		});
		if (db.clientPort) {
			assertPortAvailable(db.clientPort, {
				label: 'Database client port',
				excludeDatabaseId: db.id,
			});
		}

		await startComposeStack(db.composeFilePath, db.composeProjectName);
		return;
	}

	const databaseStatus = await getContainerStatus(db.containerName);
	if (databaseStatus !== 'running') {
		assertPortAvailable(db.port, {
			label: 'Database port',
			excludeDatabaseId: db.id,
		});
	}

	await startContainer(db.containerName);

	if (db.clientContainerName) {
		try {
			const clientStatus = await getContainerStatus(
				db.clientContainerName,
			);
			if (clientStatus !== 'running' && db.clientPort) {
				assertPortAvailable(db.clientPort, {
					label: 'Database client port',
					excludeDatabaseId: db.id,
				});
			}

			await startContainer(db.clientContainerName);
		} catch (err) {
			console.error('Failed to start client container:', err);
		}
	}
}

async function stopDatabaseContainer(id) {
	const db = getDatabaseById(id);
	if (!db) throw new Error('Database not found');

	if (isComposeDatabase(db)) {
		await ensureComposeFileExists(db);
		await stopComposeStack(db.composeFilePath, db.composeProjectName);
		return;
	}

	await stopContainer(db.containerName);

	if (db.clientContainerName) {
		try {
			await stopContainer(db.clientContainerName);
		} catch (err) {
			console.error('Failed to stop client container:', err);
		}
	}
}

async function getDatabaseStatus(id) {
	const db = getDatabaseById(id);
	if (!db) throw new Error('Database not found');
	return await getContainerStatus(db.containerName);
}

async function startClientContainer(id) {
	const db = getDatabaseById(id);
	if (!db || !db.clientContainerName) throw new Error('No client container');

	if (isComposeDatabase(db)) {
		await ensureComposeFileExists(db);
		if (db.clientPort) {
			assertPortAvailable(db.clientPort, {
				label: 'Database client port',
				excludeDatabaseId: db.id,
			});
		}

		await startComposeStack(db.composeFilePath, db.composeProjectName, [
			'client',
		]);
		return;
	}

	const clientStatus = await getContainerStatus(db.clientContainerName);
	if (clientStatus !== 'running' && db.clientPort) {
		assertPortAvailable(db.clientPort, {
			label: 'Database client port',
			excludeDatabaseId: db.id,
		});
	}

	await startContainer(db.clientContainerName);
}

async function stopClientContainer(id) {
	const db = getDatabaseById(id);
	if (!db || !db.clientContainerName) throw new Error('No client container');

	if (isComposeDatabase(db)) {
		await ensureComposeFileExists(db);
		await stopComposeStack(db.composeFilePath, db.composeProjectName, [
			'client',
		]);
		return;
	}

	await stopContainer(db.clientContainerName);
}

module.exports = {
	createDatabase,
	createDatabaseWithStream,
	deleteDatabase,
	getAllDatabases,
	getDatabaseById,
	startDatabaseContainer,
	stopDatabaseContainer,
	startClientContainer,
	stopClientContainer,
	getDatabaseStatus,
};
