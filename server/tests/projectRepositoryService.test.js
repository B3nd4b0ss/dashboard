const test = require('node:test');
const assert = require('node:assert/strict');
const {
	deleteProjectRepository,
} = require('../services/projectRepositoryService');

test('deleteProjectRepository skips repositories that are not fully connected', async () => {
	let requestCalled = false;

	const deleted = await deleteProjectRepository(
		{
			repository: {
				provider: 'github',
				status: 'failed',
				owner: 'acme',
				name: 'dashboard-app',
			},
		},
		{
			githubSettings: { token: 'token' },
			requestFn: async () => {
				requestCalled = true;
			},
		},
	);

	assert.equal(deleted, false);
	assert.equal(requestCalled, false);
});

test('deleteProjectRepository treats missing remote repositories as already deleted', async () => {
	const deleted = await deleteProjectRepository(
		{
			repository: {
				provider: 'github',
				status: 'connected',
				owner: 'acme',
				name: 'dashboard-app',
			},
		},
		{
			githubSettings: { token: 'token' },
			requestFn: async () => {
				const error = new Error('Not Found');
				error.statusCode = 404;
				throw error;
			},
		},
	);

	assert.equal(deleted, false);
});

test('deleteProjectRepository preserves GitHub permission errors with guidance', async () => {
	await assert.rejects(
		() =>
			deleteProjectRepository(
				{
					repository: {
						provider: 'github',
						status: 'connected',
						owner: 'acme',
						name: 'dashboard-app',
					},
				},
				{
					githubSettings: { token: 'token' },
					requestFn: async () => {
						const error = new Error('Resource not accessible by token');
						error.statusCode = 403;
						throw error;
					},
				},
			),
		(error) =>
			error.statusCode === 403 &&
			/delete_repo/.test(error.message) &&
			/Administration: write/.test(error.message),
	);
});

test('deleteProjectRepository deletes connected GitHub repositories', async () => {
	const requests = [];

	const deleted = await deleteProjectRepository(
		{
			repository: {
				provider: 'github',
				status: 'connected',
				owner: 'acme',
				name: 'dashboard-app',
			},
		},
		{
			githubSettings: { token: 'token' },
			requestFn: async (method, requestPath, token) => {
				requests.push({ method, requestPath, token });
				return {};
			},
		},
	);

	assert.equal(deleted, true);
	assert.deepEqual(requests, [
		{
			method: 'DELETE',
			requestPath: '/repos/acme/dashboard-app',
			token: 'token',
		},
	]);
});
