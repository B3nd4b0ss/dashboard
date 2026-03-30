import dashboardConfig from '../../../dashboard.config.json';

const BACKEND_PORT = Number(dashboardConfig?.ports?.backend) || 4000;
const FALLBACK_HOST = 'localhost';

/**
 * Shared client-side API base URL derived from the repo-level dashboard config.
 * Uses the current browser hostname so the UI and API stay aligned off localhost too.
 */
export const API_BASE_URL =
	typeof window !== 'undefined'
		? `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}`
		: `http://${FALLBACK_HOST}:${BACKEND_PORT}`;

export const DASHBOARD_API_PORT = BACKEND_PORT;
