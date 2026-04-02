const test = require('node:test');
const assert = require('node:assert/strict');
const {
	projectCommandBodySchema,
	projectCreateBodySchema,
	projectDeleteQuerySchema,
} = require('../validation/projectSchemas');
const {
	taskCreateBodySchema,
	taskUpdateBodySchema,
} = require('../validation/taskSchemas');

test('projectCreateBodySchema requires ports for managed templates', () => {
	assert.throws(
		() =>
			projectCreateBodySchema.parse({
				name: 'Dashboard',
				frontend: 'vite-react',
			}),
		(error) =>
			error.issues?.some(
				(issue) =>
					issue.path.join('.') === 'frontendPort' &&
					/required/.test(issue.message),
			),
	);
});

test('projectCreateBodySchema rejects duplicate frontend and backend ports', () => {
	assert.throws(
		() =>
			projectCreateBodySchema.parse({
				name: 'Dashboard',
				frontend: 'vite-react',
				backend: 'node',
				frontendPort: '5173',
				backendPort: '5173',
			}),
		(error) =>
			error.issues?.some(
				(issue) =>
					issue.path.join('.') === 'backendPort' &&
					/different/.test(issue.message),
			),
	);
});

test('projectCommandBodySchema trims validated command input', () => {
	const payload = projectCommandBodySchema.parse({
		command: '  npm run build  ',
		cwd: ' frontend ',
		label: ' Manual command ',
	});

	assert.equal(payload.command, 'npm run build');
	assert.equal(payload.cwd, 'frontend');
	assert.equal(payload.label, 'Manual command');
});

test('taskCreateBodySchema validates due dates and accepts normalized enums', () => {
	const payload = taskCreateBodySchema.parse({
		title: 'Ship validation layer',
		status: 'in_progress',
		priority: 'high',
		type: 'feature',
		dueDate: '2026-04-20',
	});

	assert.equal(payload.status, 'in_progress');
	assert.equal(payload.priority, 'high');
	assert.equal(payload.type, 'feature');
	assert.equal(payload.dueDate, '2026-04-20');
});

test('taskUpdateBodySchema rejects empty patch payloads', () => {
	assert.throws(
		() => taskUpdateBodySchema.parse({}),
		/At least one task field must be provided/,
	);
});

test('projectDeleteQuerySchema parses deleteRemote into a boolean', () => {
	const payload = projectDeleteQuerySchema.parse({
		deleteRemote: 'true',
	});

	assert.equal(payload.deleteRemote, true);
});

test('projectDeleteQuerySchema also accepts boolean deleteRemote values', () => {
	const payload = projectDeleteQuerySchema.parse({
		deleteRemote: true,
	});

	assert.equal(payload.deleteRemote, true);
});
