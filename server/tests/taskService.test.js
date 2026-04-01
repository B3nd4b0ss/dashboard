const test = require('node:test');
const assert = require('node:assert/strict');
const {
	buildTaskSummary,
	buildTaskKey,
	__test__,
} = require('../services/taskService');

test('buildTaskKey scopes ticket keys by project name', () => {
	assert.equal(buildTaskKey('Alpha Project', 4), 'alpha-project-4');
	assert.equal(buildTaskKey('', 2), 'general-2');
});

test('normalizeDueDate accepts YYYY-MM-DD values and rejects invalid input', () => {
	assert.equal(__test__.normalizeDueDate('2026-04-15'), '2026-04-15');
	assert.equal(__test__.normalizeDueDate('   '), null);
	assert.throws(() => __test__.normalizeDueDate('15-04-2026'), /YYYY-MM-DD/);
});

test('normalizePersistedTasks repairs duplicate ticket keys and legacy fields', () => {
	const normalized = __test__.normalizePersistedTasks([
		{
			id: 'task-1',
			title: 'Ship alpha milestone',
			description: '  Ready for review  ',
			projectName: 'Alpha Project',
			status: 'BACKLOG',
			priority: 'HIGH',
			type: 'bug',
			assigneeId: 'member-1',
			dueDate: '2026-04-15',
			ticketNumber: 1,
			ticketKey: 'wrong-key',
			branch: {
				name: ' feature/alpha-1 ',
				baseBranch: ' main ',
				remoteName: ' origin ',
				remoteUrl: ' https://example.test/repo.git ',
				status: 'PUSHED',
				createdAt: '2026-03-30T10:00:00.000Z',
				pushedAt: '2026-03-30T10:05:00.000Z',
				lastError: '   ',
			},
		},
		{
			id: 'task-2',
			title: 'Follow-up',
			projectName: 'Alpha Project',
			status: 'review',
			priority: 'low',
			type: 'legacy-type',
			assigneeId: null,
			dueDate: '',
			ticketNumber: 1,
			ticketKey: 'alpha-project-1',
			branch: {
				name: '   ',
			},
		},
		{
			id: 'task-3',
			title: 'General cleanup',
			projectName: null,
			status: null,
			priority: null,
			type: null,
			assigneeId: null,
			dueDate: null,
			ticketNumber: null,
			ticketKey: null,
			branch: null,
		},
	]);

	assert.equal(normalized.changed, true);
	assert.equal(normalized.tasks[0].ticketNumber, 1);
	assert.equal(normalized.tasks[0].ticketKey, 'alpha-project-1');
	assert.equal(normalized.tasks[0].description, 'Ready for review');
	assert.equal(normalized.tasks[0].status, 'backlog');
	assert.equal(normalized.tasks[0].priority, 'high');
	assert.equal(normalized.tasks[0].type, 'bug');
	assert.deepEqual(normalized.tasks[0].branch, {
		name: 'feature/alpha-1',
		baseBranch: 'main',
		remoteName: 'origin',
		remoteUrl: 'https://example.test/repo.git',
		status: 'pushed',
		createdAt: '2026-03-30T10:00:00.000Z',
		pushedAt: '2026-03-30T10:05:00.000Z',
		lastError: null,
	});

	assert.equal(normalized.tasks[1].ticketNumber, 2);
	assert.equal(normalized.tasks[1].ticketKey, 'alpha-project-2');
	assert.equal(normalized.tasks[1].type, 'task');
	assert.equal(normalized.tasks[1].dueDate, null);
	assert.equal(normalized.tasks[1].branch, null);

	assert.equal(normalized.tasks[2].status, 'backlog');
	assert.equal(normalized.tasks[2].priority, 'medium');
	assert.equal(normalized.tasks[2].type, 'task');
	assert.equal(normalized.tasks[2].ticketNumber, 1);
	assert.equal(normalized.tasks[2].ticketKey, 'general-1');
});

test('sortTasks orders by status, priority, due date, and ticket number', () => {
	const sorted = __test__
		.sortTasks([
			{
				id: 'done-late',
				status: 'done',
				priority: 'urgent',
				dueDate: '2026-04-04',
				ticketNumber: 8,
				updatedAt: '2026-03-31T10:05:00.000Z',
				createdAt: '2026-03-31T10:00:00.000Z',
			},
			{
				id: 'review-earlier',
				status: 'review',
				priority: 'medium',
				dueDate: '2026-04-03',
				ticketNumber: 4,
				updatedAt: '2026-03-31T09:05:00.000Z',
				createdAt: '2026-03-31T09:00:00.000Z',
			},
			{
				id: 'progress-urgent',
				status: 'in_progress',
				priority: 'urgent',
				dueDate: '2026-04-02',
				ticketNumber: 3,
				updatedAt: '2026-03-31T08:05:00.000Z',
				createdAt: '2026-03-31T08:00:00.000Z',
			},
			{
				id: 'progress-high',
				status: 'in_progress',
				priority: 'high',
				dueDate: '2026-04-01',
				ticketNumber: 2,
				updatedAt: '2026-03-31T07:05:00.000Z',
				createdAt: '2026-03-31T07:00:00.000Z',
			},
			{
				id: 'backlog-default',
				status: 'backlog',
				priority: 'low',
				dueDate: null,
				ticketNumber: 1,
				updatedAt: '2026-03-31T06:05:00.000Z',
				createdAt: '2026-03-31T06:00:00.000Z',
			},
		])
		.map((task) => task.id);

	assert.deepEqual(sorted, [
		'backlog-default',
		'progress-urgent',
		'progress-high',
		'review-earlier',
		'done-late',
	]);
});

test('buildTaskSummary reports pending, completed, and overdue counts', () => {
	const summary = buildTaskSummary([
		{ status: 'done', dueDate: '2020-01-01' },
		{ status: 'backlog', dueDate: null },
		{ status: 'in_progress', dueDate: '2099-01-01' },
		{ status: 'review', dueDate: '2020-01-01' },
	]);

	assert.deepEqual(summary, {
		total: 4,
		completed: 1,
		pending: 3,
		backlog: 1,
		inProgress: 1,
		review: 1,
		overdue: 1,
		progressPercentage: 25,
	});
});
