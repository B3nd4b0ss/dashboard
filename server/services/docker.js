const { spawn } = require('child_process');
const DOCKER_COMMAND = process.platform === 'win32' ? 'docker.exe' : 'docker';

async function dockerAvailable() {
	try {
		await runDockerCommand(['ps'], null, true);
		return true;
	} catch {
		return false;
	}
}

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

async function removeContainer(containerName) {
	try {
		await runDockerCommand(['stop', containerName]);
		await runDockerCommand(['rm', containerName]);
	} catch (err) {
		console.error('Failed to remove container:', err);
	}
}

async function startContainer(containerName) {
	await runDockerCommand(['start', containerName]);
}

async function stopContainer(containerName) {
	await runDockerCommand(['stop', containerName]);
}

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

async function upComposeStack(composeFilePath, projectName) {
	await runDockerCommand(
		buildComposeArgs(composeFilePath, projectName, ['up', '-d']),
	);
}

async function startComposeStack(composeFilePath, projectName, services = []) {
	await runDockerCommand(
		buildComposeArgs(composeFilePath, projectName, [
			'up',
			'-d',
			...services,
		]),
	);
}

async function stopComposeStack(composeFilePath, projectName, services = []) {
	await runDockerCommand(
		buildComposeArgs(composeFilePath, projectName, ['stop', ...services]),
	);
}

async function removeComposeStack(composeFilePath, projectName) {
	await runDockerCommand(
		buildComposeArgs(composeFilePath, projectName, [
			'down',
			'-v',
			'--remove-orphans',
		]),
	);
}

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
