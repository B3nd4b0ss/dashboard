const { DASHBOARD_PORTS } = require('./constants');

const DEFAULT_SERVER_HOST = '127.0.0.1';

/**
 * Parses a comma-separated origin list into trimmed origin values.
 *
 * @param {string | undefined | null} value - Raw environment variable value.
 * @returns {string[]} Normalized origin entries.
 */
function parseOriginList(value) {
	return String(value || '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
}

/**
 * Builds the default local frontend origins accepted by the dashboard backend.
 *
 * @param {number} frontendPort - Configured frontend port.
 * @returns {string[]} Default loopback origins.
 */
function getDefaultAllowedOrigins(frontendPort) {
	return [
		`http://localhost:${frontendPort}`,
		`http://127.0.0.1:${frontendPort}`,
		`http://[::1]:${frontendPort}`,
		`https://localhost:${frontendPort}`,
		`https://127.0.0.1:${frontendPort}`,
		`https://[::1]:${frontendPort}`,
	];
}

/**
 * Resolves the host the backend should bind to.
 *
 * @param {string | undefined | null} value - Optional environment override.
 * @returns {string} Server bind host.
 */
function resolveServerHost(value = process.env.DASHBOARD_HOST) {
	const trimmed = String(value || '').trim();
	return trimmed || DEFAULT_SERVER_HOST;
}

/**
 * Checks whether an incoming origin is allowed to call the local dashboard API.
 *
 * @param {string | undefined} origin - Request origin header.
 * @param {{frontendPort?: number, extraOrigins?: string[]}} [options={}] - Origin-matching options.
 * @returns {boolean} True when the origin should be accepted.
 */
function isAllowedOrigin(origin, options = {}) {
	if (!origin) {
		return true;
	}

	const frontendPort =
		Number(options.frontendPort) || DASHBOARD_PORTS.frontend;
	const allowedOrigins = new Set([
		...getDefaultAllowedOrigins(frontendPort),
		...(Array.isArray(options.extraOrigins) ? options.extraOrigins : []),
	]);

	return allowedOrigins.has(origin);
}

/**
 * Creates the CORS options used by the Express bootstrap.
 *
 * @param {{frontendPort?: number, extraOrigins?: string[]}} [options={}] - Origin-matching options.
 * @returns {{origin: Function}} CORS options object.
 */
function createCorsOptions(options = {}) {
	return {
		origin(origin, callback) {
			if (isAllowedOrigin(origin, options)) {
				callback(null, true);
				return;
			}

			const error = new Error(
				'This origin is not allowed to access the local dashboard API.',
			);
			error.code = 'CORS_ORIGIN_DENIED';
			error.statusCode = 403;
			callback(error);
		},
	};
}

module.exports = {
	DEFAULT_SERVER_HOST,
	createCorsOptions,
	getDefaultAllowedOrigins,
	isAllowedOrigin,
	parseOriginList,
	resolveServerHost,
};
