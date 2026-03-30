const path = require('path');
const { dockerAvailable, runDockerCommand } = require('./docker');

/**
 * Parses line-delimited JSON output returned by formatted Docker commands.
 *
 * @param {string} output - Raw stdout from a Docker command.
 * @returns {Array<object>} Parsed JSON rows, ignoring invalid lines.
 */
function parseJsonLines(output) {
	return String(output || '')
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			try {
				return JSON.parse(line);
			} catch (error) {
				return null;
			}
		})
		.filter(Boolean);
}

/**
 * Parses JSON output while returning a fallback value on failure.
 *
 * @param {string} output - Raw JSON string.
 * @param {any} [fallback=null] - Value to return when parsing fails.
 * @returns {any} Parsed JSON value or the fallback.
 */
function parseJson(output, fallback = null) {
	try {
		return JSON.parse(String(output || '').trim());
	} catch (error) {
		return fallback;
	}
}

/**
 * Parses JSON output and guarantees an array return type.
 *
 * @param {string} output - Raw JSON string.
 * @param {Array<any>} [fallback=[]] - Value to return when parsing does not produce an array.
 * @returns {Array<any>} Parsed array or the fallback.
 */
function parseJsonArray(output, fallback = []) {
	const parsed = parseJson(output, fallback);
	return Array.isArray(parsed) ? parsed : fallback;
}

/**
 * Classifies a container into the dashboard's high-level categories.
 *
 * @param {string} name - Docker container name.
 * @returns {'database' | 'client' | 'runtime'} Container category.
 */
function inferContainerCategory(name) {
	if (name.startsWith('db_')) {
		return 'database';
	}

	if (name.startsWith('client_')) {
		return 'client';
	}

	return 'runtime';
}

/**
 * Extracts exposed host ports from Docker's port summary string.
 *
 * @param {string} portText - Docker port description text.
 * @returns {Array<{hostPort: number, protocol: string}>} Parsed host port mappings.
 */
function parseHostPorts(portText) {
	const ports = [];
	const matcher = /(\d+)->\d+\/(tcp|udp)/g;
	let match = matcher.exec(portText);

	while (match) {
		ports.push({
			hostPort: Number(match[1]),
			protocol: match[2],
		});
		match = matcher.exec(portText);
	}

	return ports;
}

function parseComposeConfigFiles(value) {
	return String(value || '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

function normalizeComposeInfo(labels) {
	return {
		project: labels['com.docker.compose.project'] || null,
		service: labels['com.docker.compose.service'] || null,
		workingDir: labels['com.docker.compose.project.working_dir'] || null,
		configFiles: parseComposeConfigFiles(
			labels['com.docker.compose.project.config_files'],
		),
		containerNumber: labels['com.docker.compose.container-number'] || null,
	};
}

/**
 * Converts Docker CLI container data into the normalized API shape used by the UI.
 *
 * @param {object} entry - Container row from `docker ps`.
 * @param {Map<string, object>} statsMap - Stats keyed by container name or id.
 * @param {object | null} [inspectEntry=null] - Optional inspect payload for the same container.
 * @returns {object} Normalized container record.
 */
function normalizeContainer(entry, statsMap, inspectEntry = null) {
	const name = entry.Names || entry.ID;
	const labels = inspectEntry?.Config?.Labels || {};
	const compose = normalizeComposeInfo(labels);
	const stats =
		statsMap.get(name) ||
		statsMap.get(entry.ID) ||
		statsMap.get(entry.ID?.slice(0, 12)) ||
		null;
	const state = String(entry.State || 'unknown')
		.trim()
		.toLowerCase();
	const hostPorts = parseHostPorts(entry.Ports || '');

	return {
		id: entry.ID,
		name,
		image: entry.Image,
		command: entry.Command,
		createdAt: entry.CreatedAt,
		runningFor: entry.RunningFor,
		status: entry.Status,
		state,
		ports: entry.Ports || '',
		hostPorts,
		networks: entry.Networks || '',
		mounts: entry.Mounts || '',
		managedByDashboard:
			name.startsWith('db_') ||
			name.startsWith('client_') ||
			compose.configFiles.some((filePath) =>
				filePath.toLowerCase().includes('docker-stacks'),
			),
		category: inferContainerCategory(name),
		stats,
		labels,
		compose,
	};
}

/**
 * Converts Docker image CLI output into the normalized API shape used by the UI.
 *
 * @param {object} entry - Image row from `docker images`.
 * @returns {object} Normalized image record.
 */
function normalizeImage(entry) {
	const repository = entry.Repository || '<none>';
	const tag = entry.Tag || 'latest';

	return {
		id: entry.ID,
		repository,
		tag,
		label: `${repository}:${tag}`,
		size: entry.Size,
		createdSince: entry.CreatedSince,
		digest: entry.Digest,
		containers: entry.Containers,
	};
}

/**
 * Reads high-level Docker daemon information and capacity metrics.
 *
 * @returns {Promise<object>} Normalized Docker daemon info.
 */
async function getDockerInfo() {
	const output = await runDockerCommand(
		['info', '--format', '{{json .}}'],
		null,
		true,
	);
	const info = parseJson(output, {});

	return {
		serverVersion: info.ServerVersion || null,
		name: info.Name || null,
		operatingSystem: info.OperatingSystem || null,
		architecture: info.Architecture || null,
		cpus: info.NCPU || 0,
		memoryTotal: info.MemTotal || 0,
		containers: info.Containers || 0,
		containersRunning: info.ContainersRunning || 0,
		containersPaused: info.ContainersPaused || 0,
		containersStopped: info.ContainersStopped || 0,
		images: info.Images || 0,
		dockerRootDir: info.DockerRootDir || null,
	};
}

/**
 * Reads container resource stats keyed by container name.
 *
 * @returns {Promise<Map<string, object>>} Container stats map.
 */
async function getContainerStatsMap() {
	try {
		const output = await runDockerCommand(
			['stats', '--no-stream', '--no-trunc', '--format', '{{json .}}'],
			null,
			true,
		);
		const rows = parseJsonLines(output);
		const statsMap = new Map();

		for (const row of rows) {
			statsMap.set(row.Name, {
				cpu: row.CPUPerc,
				memory: row.MemUsage,
				memoryPercent: row.MemPerc,
				network: row.NetIO,
				blockIO: row.BlockIO,
				pids: row.PIDs,
			});
		}

		return statsMap;
	} catch (error) {
		return new Map();
	}
}

/**
 * Loads Docker inspect data for a set of container ids.
 *
 * @param {string[]} containerIds - Container ids to inspect.
 * @returns {Promise<Map<string, object>>} Inspect payloads keyed by container id.
 */
async function getContainerInspectMap(containerIds) {
	if (!Array.isArray(containerIds) || containerIds.length === 0) {
		return new Map();
	}

	try {
		const output = await runDockerCommand(
			['inspect', ...containerIds],
			null,
			true,
		);
		const inspectEntries = parseJsonArray(output, []);
		const inspectMap = new Map();

		for (const inspectEntry of inspectEntries) {
			if (inspectEntry?.Id) {
				inspectMap.set(inspectEntry.Id, inspectEntry);
			}
		}

		return inspectMap;
	} catch (error) {
		return new Map();
	}
}

/**
 * Lists all containers and enriches them with stats and compose metadata.
 *
 * @returns {Promise<Array<object>>} Normalized container records.
 */
async function listContainers() {
	const [output, statsMap] = await Promise.all([
		runDockerCommand(
			['ps', '-a', '--no-trunc', '--format', '{{json .}}'],
			null,
			true,
		),
		getContainerStatsMap(),
	]);
	const rows = parseJsonLines(output);
	const inspectMap = await getContainerInspectMap(
		rows.map((entry) => entry.ID).filter(Boolean),
	);

	return rows
		.map((entry) =>
			normalizeContainer(entry, statsMap, inspectMap.get(entry.ID)),
		)
		.sort((left, right) => {
			if (left.state === right.state) {
				return left.name.localeCompare(right.name);
			}

			if (left.state === 'running') {
				return -1;
			}

			if (right.state === 'running') {
				return 1;
			}

			return left.name.localeCompare(right.name);
		});
}

function normalizeStackDisplayName(container) {
	const primaryComposeFile = container.compose?.configFiles?.[0];
	if (primaryComposeFile) {
		return path.basename(path.dirname(primaryComposeFile));
	}

	if (container.compose?.workingDir) {
		return path.basename(container.compose.workingDir);
	}

	const projectName = container.compose?.project || container.name;
	return projectName.startsWith('stack-')
		? projectName.slice(6)
		: projectName;
}

function compareStackState(left, right) {
	const order = { running: 0, partial: 1, stopped: 2 };
	return (order[left] ?? 3) - (order[right] ?? 3);
}

function buildStackState(services) {
	const runningServices = services.filter(
		(service) => service.state === 'running',
	).length;

	if (runningServices === 0) {
		return 'stopped';
	}

	if (runningServices === services.length) {
		return 'running';
	}

	return 'partial';
}

function buildStackPorts(services) {
	const portMap = new Map();

	for (const service of services) {
		for (const port of service.hostPorts || []) {
			const key = `${port.hostPort}/${port.protocol}`;
			if (!portMap.has(key)) {
				portMap.set(key, port);
			}
		}
	}

	return [...portMap.values()].sort(
		(left, right) => left.hostPort - right.hostPort,
	);
}

function groupContainersByComposeProject(containers) {
	const stacksMap = new Map();
	const standaloneContainers = [];

	for (const container of containers) {
		if (!container.compose?.project) {
			standaloneContainers.push(container);
			continue;
		}

		const stackId = container.compose.project;
		const existingStack = stacksMap.get(stackId);

		if (!existingStack) {
			const displayName = normalizeStackDisplayName(container);
			const primaryComposeFile = container.compose.configFiles[0] || null;
			const folderPath = primaryComposeFile
				? path.dirname(primaryComposeFile)
				: container.compose.workingDir || null;

			stacksMap.set(stackId, {
				id: stackId,
				projectName: stackId,
				displayName,
				folderName: displayName,
				folderPath,
				workingDir: container.compose.workingDir,
				composeFiles: container.compose.configFiles,
				composeFileNames: container.compose.configFiles.map(
					(filePath) => path.basename(filePath),
				),
				services: [container],
				managedByDashboard: container.managedByDashboard,
			});
			continue;
		}

		existingStack.services.push(container);
		existingStack.managedByDashboard =
			existingStack.managedByDashboard || container.managedByDashboard;
	}

	const stacks = [...stacksMap.values()]
		.map((stack) => {
			const services = [...stack.services].sort((left, right) => {
				const leftName = left.compose?.service || left.name;
				const rightName = right.compose?.service || right.name;
				return leftName.localeCompare(rightName);
			});
			const runningServices = services.filter(
				(service) => service.state === 'running',
			).length;
			const state = buildStackState(services);

			return {
				...stack,
				services,
				serviceCount: services.length,
				runningServices,
				stoppedServices: services.length - runningServices,
				state,
				hostPorts: buildStackPorts(services),
			};
		})
		.sort((left, right) => {
			const stateComparison = compareStackState(left.state, right.state);
			if (stateComparison !== 0) {
				return stateComparison;
			}

			return left.displayName.localeCompare(right.displayName);
		});

	const sortedStandaloneContainers = [...standaloneContainers].sort(
		(left, right) => {
			if (left.state === right.state) {
				return left.name.localeCompare(right.name);
			}

			if (left.state === 'running') {
				return -1;
			}

			if (right.state === 'running') {
				return 1;
			}

			return left.name.localeCompare(right.name);
		},
	);

	return {
		stacks,
		standaloneContainers: sortedStandaloneContainers,
	};
}

/**
 * Lists locally available Docker images.
 *
 * @returns {Promise<Array<object>>} Normalized image records.
 */
async function listImages() {
	const output = await runDockerCommand(
		['images', '--format', '{{json .}}'],
		null,
		true,
	);

	return parseJsonLines(output)
		.map(normalizeImage)
		.sort((left, right) => left.repository.localeCompare(right.repository));
}

/**
 * Builds the full Docker overview payload used by the dashboard.
 *
 * @returns {Promise<object>} Docker availability, daemon info, stacks, containers, and images.
 */
async function getDockerOverview() {
	const available = await dockerAvailable();

	if (!available) {
		return {
			available: false,
			info: null,
			summary: {
				containers: 0,
				runningContainers: 0,
				stoppedContainers: 0,
				managedContainers: 0,
				images: 0,
			},
			containers: [],
			stacks: [],
			standaloneContainers: [],
			images: [],
		};
	}

	const [info, containers, images] = await Promise.all([
		getDockerInfo(),
		listContainers(),
		listImages(),
	]);
	const { stacks, standaloneContainers } =
		groupContainersByComposeProject(containers);

	return {
		available: true,
		info,
		summary: {
			containers: containers.length,
			runningContainers: containers.filter(
				(container) => container.state === 'running',
			).length,
			stoppedContainers: containers.filter(
				(container) => container.state !== 'running',
			).length,
			managedContainers: containers.filter(
				(container) => container.managedByDashboard,
			).length,
			stacks: stacks.length,
			stackServices: stacks.reduce(
				(total, stack) => total + stack.serviceCount,
				0,
			),
			standaloneContainers: standaloneContainers.length,
			images: images.length,
		},
		containers,
		stacks,
		standaloneContainers,
		images,
	};
}

/**
 * Returns the normalized compose stack view for one compose project.
 *
 * @param {string} projectName - Compose project name or derived stack id.
 * @returns {Promise<object>} Normalized compose stack details.
 */
async function getDockerStack(projectName) {
	await assertDockerReady();
	const containers = await listContainers();
	const { stacks } = groupContainersByComposeProject(containers);
	const stack = stacks.find(
		(entry) => entry.id.toLowerCase() === projectName.toLowerCase(),
	);

	if (!stack) {
		throw new Error('Docker stack not found');
	}

	return stack;
}

/**
 * Throws when Docker Desktop is unavailable.
 *
 * @returns {Promise<void>}
 */
async function assertDockerReady() {
	if (!(await dockerAvailable())) {
		throw new Error(
			'Docker is not running. Please start Docker Desktop and try again.',
		);
	}
}

/**
 * Starts a Docker container after validating Docker availability.
 *
 * @param {string} containerName - Container name to start.
 * @returns {Promise<void>}
 */
async function startDockerContainer(containerName) {
	await assertDockerReady();
	await runDockerCommand(['start', containerName]);
}

/**
 * Stops a Docker container after validating Docker availability.
 *
 * @param {string} containerName - Container name to stop.
 * @returns {Promise<void>}
 */
async function stopDockerContainer(containerName) {
	await assertDockerReady();
	await runDockerCommand(['stop', containerName]);
}

/**
 * Restarts a Docker container after validating Docker availability.
 *
 * @param {string} containerName - Container name to restart.
 * @returns {Promise<void>}
 */
async function restartDockerContainer(containerName) {
	await assertDockerReady();
	await runDockerCommand(['restart', containerName]);
}

/**
 * Reads recent logs for a Docker container.
 *
 * @param {string} containerName - Container name to inspect.
 * @param {number} [tail=160] - Requested number of lines to read, clamped to a safe range.
 * @returns {Promise<{containerName: string, tail: number, logs: string}>} Container logs payload.
 */
async function getDockerContainerLogs(containerName, tail = 160) {
	await assertDockerReady();
	const safeTail = Number.isFinite(Number(tail))
		? Math.max(20, Math.min(500, Number(tail)))
		: 160;
	const output = await runDockerCommand(
		['logs', '--tail', String(safeTail), containerName],
		null,
		true,
	);

	return {
		containerName,
		tail: safeTail,
		logs: output,
	};
}

module.exports = {
	getDockerOverview,
	getDockerStack,
	startDockerContainer,
	stopDockerContainer,
	restartDockerContainer,
	getDockerContainerLogs,
};
