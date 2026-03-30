const { spawn } = require('child_process');
const DOCKER_COMMAND = process.platform === 'win32' ? 'docker.exe' : 'docker';

/**
 * Checks whether Docker is installed and responsive.
 *
 * @returns {Promise<boolean>} True when `docker ps` succeeds.
 */
async function dockerAvailable() {
	try {
		await runDockerCommand(['ps'], null, true);
		return true;
	} catch {
		return false;
	}
}

/**
 * Runs a Docker CLI command and optionally captures the output.
 *
 * @param {string[]} args - Docker arguments without the base executable.
 * @param {string | null} [cwd=null] - Optional working directory for compose-style commands.
 * @param {boolean} [silent=false] - When true, captures stdout/stderr instead of inheriting the terminal.
 * @returns {Promise<string | void>} Captured stdout when `silent` is true, otherwise resolves when the command completes.
 */
function runDockerCommand(args, cwd = null, silent = false) {
	return new Promise((resolve, reject) => {
		const proc = spawn(DOCKER_COMMAND, args, {
			cwd,
			stdio: silent ? ['ignore', 'pipe', 'pipe'] : 'inherit',
			shell: false,
			windowsHide: true,
		});
		let stdout = '';
		let stderr = '';
		if (silent) {
			proc.stdout.on('data', (data) => {
				stdout += data.toString();
			});
			proc.stderr.on('data', (data) => {
				stderr += data.toString();
			});
		}
		proc.on('close', (code) => {
			if (code === 0) {
				if (silent) {
					resolve(stdout.trim());
				} else {
					resolve();
				}
			} else {
				reject(
					new Error(
						`Docker command failed with code ${code}: ${
							stderr.trim() ||
							stdout.trim() ||
							'Unknown Docker error'
						}`,
					),
				);
			}
		});
		proc.on('error', (error) => {
			reject(
				new Error(`Failed to start Docker command: ${error.message}`),
			);
		});
	});
}

/**
 * Pulls and starts a PostgreSQL container for the dashboard.
 *
 * @param {string} name - Database name used to derive the container name.
 * @param {number} port - Host port to bind to PostgreSQL's internal port.
 * @param {string} password - Password assigned to the generated database users.
 * @returns {Promise<string>} Created container name.
 */
async function createPostgresContainer(name, port, password) {
	const containerName = `db_${name.replace(/[^a-z0-9]/gi, '_')}`;
	// Ensure image is pulled
	await runDockerCommand(['pull', 'postgres:15']);
	await runDockerCommand([
		'run',
		'-d',
		'--name',
		containerName,
		'-e',
		`POSTGRES_PASSWORD=${password}`,
		'-e',
		'POSTGRES_USER=appuser',
		'-e',
		'POSTGRES_DB=appdb',
		'-p',
		`${port}:5432`,
		'postgres:15',
	]);
	return containerName;
}

/**
 * Pulls and starts an Adminer client container linked to a database container.
 *
 * @param {string} dbContainerName - Existing database container name the client should connect to.
 * @param {number} clientPort - Host port to expose the Adminer UI on.
 * @returns {Promise<string>} Created client container name.
 */
async function createAdminerContainer(dbContainerName, clientPort) {
	const clientContainerName = `client_${dbContainerName}`;
	// Ensure image is pulled
	await runDockerCommand(['pull', 'adminer:latest']);
	await runDockerCommand([
		'run',
		'-d',
		'--name',
		clientContainerName,
		'--link',
		`${dbContainerName}:postgres`,
		'-p',
		`${clientPort}:8080`,
		'adminer:latest',
	]);
	return clientContainerName;
}

/**
 * Pulls and starts a MySQL container for the dashboard.
 *
 * @param {string} name - Database name used to derive the container name.
 * @param {number} port - Host port to bind to MySQL's internal port.
 * @param {string} password - Password assigned to the generated database users.
 * @returns {Promise<string>} Created container name.
 */
async function createMySQLContainer(name, port, password) {
	const containerName = `db_${name.replace(/[^a-z0-9]/gi, '_')}`;
	await runDockerCommand(['pull', 'mysql:8']);
	await runDockerCommand([
		'run',
		'-d',
		'--name',
		containerName,
		'-e',
		`MYSQL_ROOT_PASSWORD=${password}`,
		'-e',
		'MYSQL_DATABASE=appdb',
		'-e',
		'MYSQL_USER=appuser',
		'-e',
		`MYSQL_PASSWORD=${password}`,
		'-p',
		`${port}:3306`,
		'mysql:8',
	]);
	return containerName;
}

/**
 * Pulls and starts a MongoDB container for the dashboard.
 *
 * @param {string} name - Database name used to derive the container name.
 * @param {number} port - Host port to bind to MongoDB's internal port.
 * @returns {Promise<string>} Created container name.
 */
async function createMongoDBContainer(name, port) {
	const containerName = `db_${name.replace(/[^a-z0-9]/gi, '_')}`;
	await runDockerCommand(['pull', 'mongo:latest']);
	await runDockerCommand([
		'run',
		'-d',
		'--name',
		containerName,
		'-p',
		`${port}:27017`,
		'mongo:latest',
	]);
	return containerName;
}

/**
 * Stops and removes a single Docker container when it exists.
 *
 * @param {string} containerName - Container name to remove.
 * @returns {Promise<void>}
 */
async function removeContainer(containerName) {
	try {
		await runDockerCommand(['stop', containerName]);
		await runDockerCommand(['rm', containerName]);
	} catch (err) {
		console.error('Failed to remove container:', err);
	}
}

/**
 * Starts a stopped Docker container.
 *
 * @param {string} containerName - Container name to start.
 * @returns {Promise<void>}
 */
async function startContainer(containerName) {
	await runDockerCommand(['start', containerName]);
}

/**
 * Stops a running Docker container.
 *
 * @param {string} containerName - Container name to stop.
 * @returns {Promise<void>}
 */
async function stopContainer(containerName) {
	await runDockerCommand(['stop', containerName]);
}

/**
 * Builds the argument list for a docker compose command.
 *
 * @param {string} composeFilePath - Full path to the compose file.
 * @param {string} projectName - Compose project name used for namespacing.
 * @param {string[]} composeArgs - Command-specific compose arguments such as `up -d`.
 * @returns {string[]} Docker CLI arguments ready to pass to `runDockerCommand`.
 */
function buildComposeArgs(composeFilePath, projectName, composeArgs) {
	return [
		'compose',
		'-f',
		composeFilePath,
		'-p',
		projectName,
		...composeArgs,
	];
}

/**
 * Creates or recreates an entire compose stack in detached mode.
 *
 * @param {string} composeFilePath - Full path to the compose file.
 * @param {string} projectName - Compose project name used for namespacing.
 * @returns {Promise<void>}
 */
async function upComposeStack(composeFilePath, projectName) {
	await runDockerCommand(
		buildComposeArgs(composeFilePath, projectName, ['up', '-d']),
	);
}

/**
 * Starts a compose stack or a subset of its services.
 *
 * @param {string} composeFilePath - Full path to the compose file.
 * @param {string} projectName - Compose project name used for namespacing.
 * @param {string[]} [services=[]] - Optional list of compose service names to start.
 * @returns {Promise<void>}
 */
async function startComposeStack(composeFilePath, projectName, services = []) {
	await runDockerCommand(
		buildComposeArgs(composeFilePath, projectName, [
			'up',
			'-d',
			...services,
		]),
	);
}

/**
 * Stops a compose stack or a subset of its services.
 *
 * @param {string} composeFilePath - Full path to the compose file.
 * @param {string} projectName - Compose project name used for namespacing.
 * @param {string[]} [services=[]] - Optional list of compose service names to stop.
 * @returns {Promise<void>}
 */
async function stopComposeStack(composeFilePath, projectName, services = []) {
	await runDockerCommand(
		buildComposeArgs(composeFilePath, projectName, ['stop', ...services]),
	);
}

/**
 * Tears down a compose stack and removes its named volumes and orphans.
 *
 * @param {string} composeFilePath - Full path to the compose file.
 * @param {string} projectName - Compose project name used for namespacing.
 * @returns {Promise<void>}
 */
async function removeComposeStack(composeFilePath, projectName) {
	await runDockerCommand(
		buildComposeArgs(composeFilePath, projectName, [
			'down',
			'-v',
			'--remove-orphans',
		]),
	);
}

/**
 * Reads the current Docker state for a container.
 *
 * @param {string} containerName - Container name to inspect.
 * @returns {Promise<string>} Docker state such as `running`, `stopped`, or `unknown`.
 */
async function getContainerStatus(containerName) {
	try {
		const stdout = await runDockerCommand(
			['inspect', '--format', '{{.State.Status}}', containerName],
			null,
			true,
		);
		console.log(`Container ${containerName} status: ${stdout}`);
		if (!stdout || stdout === '') return 'unknown';
		if (stdout === 'exited') return 'stopped';
		return stdout.trim();
	} catch (err) {
		console.error('Error getting container status:', err);
		return 'unknown';
	}
}

module.exports = {
	dockerAvailable,
	runDockerCommand,
	createPostgresContainer,
	createAdminerContainer,
	removeContainer,
	startContainer,
	stopContainer,
	upComposeStack,
	startComposeStack,
	stopComposeStack,
	removeComposeStack,
	getContainerStatus,
	createMySQLContainer,
	createMongoDBContainer,
};
