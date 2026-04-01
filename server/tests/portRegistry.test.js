const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('child_process');
const fileOperations = require('../utils/fileOperations');
const {
	assertPortAvailable,
	findNextAvailablePort,
	inspectPort,
	listConfiguredPortBindings,
	listSystemPortBindings,
	normalizePort,
} = require('../services/portRegistry');

test('normalizePort accepts numeric strings and rejects out-of-range values', () => {
	assert.equal(normalizePort('5173', 'Frontend port'), 5173);
	assert.throws(
		() => normalizePort('70000', 'Frontend port'),
		/Frontend port must be a number between 1 and 65535/,
	);
});

test('listSystemPortBindings parses listening TCP and UDP entries', (t) => {
	t.mock.method(childProcess, 'spawnSync', () => ({
		status: 0,
		stdout: [
			'Proto  Local Address          Foreign Address        State           PID',
			'TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       1200',
			'UDP    0.0.0.0:5353           *:*                                    4400',
		].join('\n'),
		stderr: '',
	}));

	const bindings = listSystemPortBindings();

	assert.deepEqual([...bindings.get(5173).protocols], ['TCP']);
	assert.deepEqual(bindings.get(5173).bindings, [
		{
			protocol: 'TCP',
			localAddress: '127.0.0.1:5173',
			pid: '1200',
		},
	]);
	assert.deepEqual([...bindings.get(5353).protocols], ['UDP']);
});

test('listConfiguredPortBindings reports project and database reservations', (t) => {
	t.mock.method(fileOperations, 'loadProjects', () => [
		{ name: 'Alpha', frontendPort: 3000, backendPort: 4000 },
	]);
	t.mock.method(fileOperations, 'loadDatabases', () => [
		{
			id: 'db-1',
			name: 'Local Postgres',
			port: 5432,
			clientPort: 6432,
		},
	]);

	const bindings = listConfiguredPortBindings();

	assert.deepEqual(bindings.get(3000), ['project "Alpha" frontend']);
	assert.deepEqual(bindings.get(4000), ['project "Alpha" backend']);
	assert.deepEqual(bindings.get(5432), ['database "Local Postgres"']);
	assert.deepEqual(bindings.get(6432), ['database client "Local Postgres"']);
});

test('inspectPort combines system and configured conflicts into one report', (t) => {
	t.mock.method(childProcess, 'spawnSync', () => ({
		status: 0,
		stdout: 'TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       1200',
		stderr: '',
	}));
	t.mock.method(fileOperations, 'loadProjects', () => [
		{ name: 'Alpha', frontendPort: 3000, backendPort: 4000 },
	]);
	t.mock.method(fileOperations, 'loadDatabases', () => []);

	const report = inspectPort(3000, { label: 'Frontend port' });

	assert.equal(report.available, false);
	assert.match(
		report.conflicts.join(' | '),
		/the operating system is currently using it via TCP/,
	);
	assert.match(
		report.conflicts.join(' | '),
		/it is already assigned to project "Alpha" frontend/,
	);
});

test('assertPortAvailable rejects protected ports with a detailed message', (t) => {
	t.mock.method(childProcess, 'spawnSync', () => ({
		status: 0,
		stdout: '',
		stderr: '',
	}));
	t.mock.method(fileOperations, 'loadProjects', () => []);
	t.mock.method(fileOperations, 'loadDatabases', () => []);

	assert.throws(
		() => assertPortAvailable(80, { label: 'Frontend port' }),
		/Frontend port 80 is not safe to use: .*reserved.*HTTP traffic commonly uses this port/i,
	);
});

test('findNextAvailablePort skips configured conflicts and ignored ports', (t) => {
	t.mock.method(childProcess, 'spawnSync', () => ({
		status: 0,
		stdout: '',
		stderr: '',
	}));
	t.mock.method(fileOperations, 'loadProjects', () => [
		{ name: 'Alpha', frontendPort: 3000, backendPort: 3001 },
	]);
	t.mock.method(fileOperations, 'loadDatabases', () => []);

	assert.equal(
		findNextAvailablePort(3000, {
			label: 'Frontend port',
			ignorePorts: [3001],
		}),
		3001,
	);
	assert.equal(findNextAvailablePort(3000, { label: 'Frontend port' }), 3002);
});
