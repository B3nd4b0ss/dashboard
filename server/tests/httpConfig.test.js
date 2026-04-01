const test = require('node:test');
const assert = require('node:assert/strict');
const {
	createCorsOptions,
	isAllowedOrigin,
	parseOriginList,
	resolveServerHost,
} = require('../config/http');

test('parseOriginList trims and removes empty entries', () => {
	assert.deepEqual(
		parseOriginList(
			' http://localhost:5173, https://example.test ,, http://127.0.0.1:5173 ',
		),
		[
			'http://localhost:5173',
			'https://example.test',
			'http://127.0.0.1:5173',
		],
	);
});

test('resolveServerHost defaults to loopback', () => {
	assert.equal(resolveServerHost(''), '127.0.0.1');
	assert.equal(resolveServerHost('0.0.0.0'), '0.0.0.0');
});

test('isAllowedOrigin accepts loopback origins and configured extras', () => {
	assert.equal(
		isAllowedOrigin('http://localhost:5173', {
			frontendPort: 5173,
		}),
		true,
	);
	assert.equal(
		isAllowedOrigin('https://review.example.test', {
			extraOrigins: ['https://review.example.test'],
		}),
		true,
	);
	assert.equal(
		isAllowedOrigin('https://evil.example.test', {
			extraOrigins: ['https://review.example.test'],
		}),
		false,
	);
});

test('createCorsOptions rejects disallowed origins with a 403-style error', async () => {
	const options = createCorsOptions({
		frontendPort: 5173,
	});

	await assert.rejects(
		() =>
			new Promise((resolve, reject) => {
				options.origin(
					'https://evil.example.test',
					(error, allowed) => {
						if (error) {
							reject(error);
							return;
						}

						resolve(allowed);
					},
				);
			}),
		(error) =>
			error?.statusCode === 403 && error?.code === 'CORS_ORIGIN_DENIED',
	);
});
