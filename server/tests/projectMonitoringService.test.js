const test = require('node:test');
const assert = require('node:assert/strict');
const { __test__ } = require('../services/projectMonitoringService');

test('parsePosixMetricLine parses ps output into a monitoring sample', () => {
	const sample = __test__.parsePosixMetricLine(
		'4120 12.5 20480 Fri Apr 10 09:15:30 2026 node',
	);

	assert.equal(sample.pid, 4120);
	assert.equal(sample.cpuPercent, 12.5);
	assert.equal(sample.memoryBytes, 20480 * 1024);
	assert.equal(sample.processName, 'node');
	assert.ok(sample.startedAt);
});

test('parsePosixMetricLine returns null for malformed rows', () => {
	assert.equal(__test__.parsePosixMetricLine('not a ps row'), null);
});
