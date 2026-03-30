const test = require('node:test');
const assert = require('node:assert/strict');
const { __test__ } = require('../services/projectTerminalService');

test('assertManualCommandsAllowed throws a 403 error when disabled', () => {
	assert.throws(
		() =>
			__test__.assertManualCommandsAllowed({
				allowManualCommands: false,
			}),
		(error) =>
			error?.statusCode === 403 &&
			/Manual terminal commands are disabled/.test(error.message),
	);
});

test('assertManualCommandsAllowed accepts enabled settings', () => {
	assert.doesNotThrow(() =>
		__test__.assertManualCommandsAllowed({
			allowManualCommands: true,
		}),
	);
});

test('buildShellCommandFromSteps preserves the full preset sequence', () => {
	const command = __test__.buildShellCommandFromSteps([
		'npm run test',
		'npm run build',
	]);

	assert.match(command, /npm run test/);
	assert.match(command, /npm run build/);

	if (process.platform === 'win32') {
		assert.match(command, /\$LASTEXITCODE/);
	} else {
		assert.equal(command, 'npm run test && npm run build');
	}
});

test('trimOutput keeps only the newest terminal output when over the cap', () => {
	const longOutput = 'a'.repeat(__test__.MAX_OUTPUT_LENGTH + 24);
	const trimmed = __test__.trimOutput(longOutput);

	assert.equal(trimmed.truncated, true);
	assert.equal(trimmed.output.length, __test__.MAX_OUTPUT_LENGTH);
	assert.equal(trimmed.output, longOutput.slice(24));
});

test('toHistoryEntry keeps audit metadata without terminal output', () => {
	const historyEntry = __test__.toHistoryEntry({
		id: 'exec-1',
		projectName: 'dashboard',
		kind: 'manual',
		label: 'Manual command',
		command: 'npm run build',
		cwd: 'frontend',
		status: 'completed',
		startedAt: '2026-03-30T10:00:00.000Z',
		updatedAt: '2026-03-30T10:00:05.000Z',
		endedAt: '2026-03-30T10:00:05.000Z',
		exitCode: 0,
		output: 'ignored output',
	});

	assert.deepEqual(historyEntry, {
		id: 'exec-1',
		projectName: 'dashboard',
		kind: 'manual',
		label: 'Manual command',
		command: 'npm run build',
		cwd: 'frontend',
		status: 'completed',
		startedAt: '2026-03-30T10:00:00.000Z',
		updatedAt: '2026-03-30T10:00:05.000Z',
		endedAt: '2026-03-30T10:00:05.000Z',
		exitCode: 0,
	});
});
