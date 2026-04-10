const childProcess = require('child_process');
const fileOperations = require('../utils/fileOperations');

const RESERVED_SYSTEM_PORT_MAX = 1023;
const PROTECTED_PORT_REASONS = new Map([
	[53, 'DNS is commonly bound here'],
	[67, 'DHCP server traffic commonly uses this port'],
	[68, 'DHCP client traffic commonly uses this port'],
	[69, 'TFTP commonly uses this port'],
	[80, 'HTTP traffic commonly uses this port'],
	[88, 'Kerberos commonly uses this port'],
	[110, 'POP3 commonly uses this port'],
	[123, 'NTP commonly uses this port'],
	[135, 'Windows RPC commonly uses this port'],
	[137, 'NetBIOS name service commonly uses this port'],
	[138, 'NetBIOS datagram service commonly uses this port'],
	[139, 'NetBIOS session service commonly uses this port'],
	[143, 'IMAP commonly uses this port'],
	[161, 'SNMP commonly uses this port'],
	[162, 'SNMP traps commonly use this port'],
	[389, 'LDAP commonly uses this port'],
	[443, 'HTTPS traffic commonly uses this port'],
	[445, 'SMB commonly uses this port'],
	[465, 'SMTPS commonly uses this port'],
	[514, 'Syslog commonly uses this port'],
	[587, 'Mail submission commonly uses this port'],
	[631, 'IPP printing commonly uses this port'],
	[636, 'LDAPS commonly uses this port'],
	[1433, 'Microsoft SQL Server commonly uses this port'],
	[1434, 'SQL Server Browser commonly uses this port'],
	[1521, 'Oracle database commonly uses this port'],
	[1723, 'PPTP commonly uses this port'],
	[1900, 'SSDP and UPnP discovery commonly use this port'],
	[2049, 'NFS commonly uses this port'],
	[2375, 'Docker commonly uses this port'],
	[2376, 'Docker TLS commonly uses this port'],
	[3702, 'WS-Discovery commonly uses this port'],
	[4000, 'Port of this Project'],
	[5353, 'mDNS discovery commonly uses this port'],
	[5355, 'LLMNR commonly uses this port'],
]);

/**
 * Normalizes and validates a TCP/UDP port number.
 *
 * @param {string | number} port - Port entered by the user or read from stored data.
 * @param {string} [label='Port'] - Friendly label used in validation errors.
 * @returns {number} Normalized integer port number.
 */
function normalizePort(port, label = 'Port') {
	const parsedPort = Number.parseInt(port, 10);

	if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
		throw new Error(`${label} must be a number between 1 and 65535`);
	}

	return parsedPort;
}

/**
 * Extracts the numeric port from a `host:port` style address string.
 *
 * @param {string} localAddress - Local address from `netstat`.
 * @returns {number | null} Parsed port when present.
 */
function extractPort(localAddress) {
	if (!localAddress) {
		return null;
	}

	const match = String(localAddress)
		.trim()
		.match(/:(\d+)$/);
	return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Adds a system-level port binding to the aggregation map used during conflict checks.
 *
 * @param {Map<number, {protocols: Set<string>, bindings: Array<object>}>} bindingMap - Mutable binding registry.
 * @param {number | null} port - Port to add.
 * @param {string} protocol - Network protocol such as TCP or UDP.
 * @param {string} localAddress - Original local address reported by the OS.
 * @param {string} pid - Process id reported by the OS.
 * @returns {void}
 */
function addSystemBinding(bindingMap, port, protocol, localAddress, pid) {
	if (!port) {
		return;
	}

	if (!bindingMap.has(port)) {
		bindingMap.set(port, {
			protocols: new Set(),
			bindings: [],
		});
	}

	const entry = bindingMap.get(port);
	entry.protocols.add(protocol);
	entry.bindings.push({
		protocol,
		localAddress,
		pid,
	});
}

/**
 * Reads the host machine's listening TCP/UDP bindings using `netstat`.
 *
 * @returns {Map<number, {protocols: Set<string>, bindings: Array<object>}>} System bindings keyed by port.
 */
function listSystemPortBindings() {
	const result = childProcess.spawnSync('netstat', ['-ano'], {
		encoding: 'utf8',
		windowsHide: true,
	});

	if (result.error) {
		throw new Error(
			`Failed to inspect system ports: ${result.error.message}`,
		);
	}

	if (result.status !== 0) {
		throw new Error(
			`Failed to inspect system ports: ${
				(result.stderr || result.stdout || '').trim() ||
				`netstat exited with code ${result.status}`
			}`,
		);
	}

	const bindingMap = new Map();
	const lines = result.stdout.split(/\r?\n/);

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) {
			continue;
		}

		const parts = line.split(/\s+/);
		const protocol = parts[0];

		if (protocol === 'TCP' && parts[3] === 'LISTENING') {
			addSystemBinding(
				bindingMap,
				extractPort(parts[1]),
				'TCP',
				parts[1],
				parts[4],
			);
		}

		if (protocol === 'UDP') {
			addSystemBinding(
				bindingMap,
				extractPort(parts[1]),
				'UDP',
				parts[1],
				parts[3],
			);
		}
	}

	return bindingMap;
}

/**
 * Builds the set of ports already reserved by persisted projects and databases.
 *
 * @param {{excludeProjectName?: string | null, excludeDatabaseId?: string | null, ignorePorts?: Array<string | number>}} [options={}] - Exclusions used while validating edits.
 * @returns {Map<number, string[]>} Configured port usages keyed by port number.
 */
function listConfiguredPortBindings(options = {}) {
	const {
		excludeProjectName = null,
		excludeDatabaseId = null,
		ignorePorts = [],
	} = options;
	const ignored = new Set(
		ignorePorts.map((port) => Number.parseInt(port, 10)),
	);
	const bindings = new Map();

	for (const project of fileOperations.loadProjects()) {
		if (
			excludeProjectName &&
			project.name.toLowerCase() === excludeProjectName.toLowerCase()
		) {
			continue;
		}

		for (const entry of [
			project.frontendPort
				? {
						port: project.frontendPort,
						label: `project "${project.name}" frontend`,
					}
				: null,
			project.backendPort
				? {
						port: project.backendPort,
						label: `project "${project.name}" backend`,
					}
				: null,
		]) {
			if (!entry || ignored.has(entry.port)) {
				continue;
			}

			if (!bindings.has(entry.port)) {
				bindings.set(entry.port, []);
			}

			bindings.get(entry.port).push(entry.label);
		}
	}

	for (const database of fileOperations.loadDatabases()) {
		if (excludeDatabaseId && database.id === excludeDatabaseId) {
			continue;
		}

		for (const entry of [
			database.port
				? {
						port: database.port,
						label: `database "${database.name}"`,
					}
				: null,
			database.clientPort
				? {
						port: database.clientPort,
						label: `database client "${database.name}"`,
					}
				: null,
		]) {
			if (!entry || ignored.has(entry.port)) {
				continue;
			}

			if (!bindings.has(entry.port)) {
				bindings.set(entry.port, []);
			}

			bindings.get(entry.port).push(entry.label);
		}
	}

	return bindings;
}

/**
 * Produces a detailed availability report for a candidate port.
 *
 * @param {string | number} port - Port to inspect.
 * @param {{label?: string, excludeProjectName?: string | null, excludeDatabaseId?: string | null, ignorePorts?: Array<string | number>}} [options={}] - Validation settings and exclusions.
 * @returns {{port: number, available: boolean, conflicts: string[]}} Availability report with human-readable conflicts.
 */
function inspectPort(port, options = {}) {
	const {
		label = 'Port',
		excludeProjectName = null,
		excludeDatabaseId = null,
		ignorePorts = [],
	} = options;
	const normalizedPort = normalizePort(port, label);
	const conflicts = [];

	if (normalizedPort <= RESERVED_SYSTEM_PORT_MAX) {
		conflicts.push(
			`ports 1-${RESERVED_SYSTEM_PORT_MAX} are reserved for system services`,
		);
	}

	if (PROTECTED_PORT_REASONS.has(normalizedPort)) {
		conflicts.push(PROTECTED_PORT_REASONS.get(normalizedPort));
	}

	const systemBindings = listSystemPortBindings().get(normalizedPort);
	if (systemBindings) {
		const protocols = [...systemBindings.protocols].sort().join(', ');
		conflicts.push(
			`the operating system is currently using it via ${protocols}`,
		);
	}

	const configuredBindings = listConfiguredPortBindings({
		excludeProjectName,
		excludeDatabaseId,
		ignorePorts,
	}).get(normalizedPort);
	if (configuredBindings?.length) {
		conflicts.push(
			`it is already assigned to ${configuredBindings.join(', ')}`,
		);
	}

	return {
		port: normalizedPort,
		available: conflicts.length === 0,
		conflicts,
	};
}

/**
 * Throws when a port is not safe for assignment and otherwise returns the normalized port.
 *
 * @param {string | number} port - Candidate port to validate.
 * @param {{label?: string, excludeProjectName?: string | null, excludeDatabaseId?: string | null, ignorePorts?: Array<string | number>}} [options={}] - Validation settings and exclusions.
 * @returns {number} Validated port number.
 */
function assertPortAvailable(port, options = {}) {
	const report = inspectPort(port, options);

	if (!report.available) {
		throw new Error(
			`${options.label || 'Port'} ${report.port} is not safe to use: ${report.conflicts.join('; ')}`,
		);
	}

	return report.port;
}

/**
 * Scans upward from a starting port until a safe port is found.
 *
 * @param {string | number} startPort - First port to try.
 * @param {{label?: string, excludeProjectName?: string | null, excludeDatabaseId?: string | null, ignorePorts?: Array<string | number>}} [options={}] - Validation settings and exclusions.
 * @returns {number} First safe available port at or above the starting value.
 */
function findNextAvailablePort(startPort, options = {}) {
	let candidate = normalizePort(startPort, options.label || 'Port');

	while (candidate <= 65535) {
		const report = inspectPort(candidate, options);
		if (report.available) {
			return candidate;
		}

		candidate += 1;
	}

	throw new Error(
		`No safe ${options.label || 'port'} found above ${startPort}`,
	);
}

module.exports = {
	PROTECTED_PORT_REASONS,
	normalizePort,
	listSystemPortBindings,
	listConfiguredPortBindings,
	inspectPort,
	assertPortAvailable,
	findNextAvailablePort,
};
