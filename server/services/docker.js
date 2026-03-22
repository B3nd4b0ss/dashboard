const { spawn } = require('child_process');

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
		const proc = spawn('docker', args, {
			cwd,
			stdio: silent ? 'pipe' : 'inherit',
			shell: true,
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
						`Docker command failed with code ${code}: ${stderr}`,
					),
				);
			}
		});
		proc.on('error', reject);
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

async function getContainerStatus(containerName) {
	try {
		// Use docker ps -a to get all containers (including stopped)
		const stdout = await runDockerCommand(
			[
				'ps',
				'-a',
				'--filter',
				`name=${containerName}`,
				'--format',
				'{{.Status}}',
			],
			null,
			true,
		);
		if (!stdout || stdout === '') {
			return 'unknown';
		}
		if (stdout.startsWith('Up')) {
			return 'running';
		}
		if (stdout.startsWith('Exited')) {
			return 'stopped';
		}
		return 'unknown';
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
	getContainerStatus,
};
