import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

const API = API_BASE_URL;
const PORT_CHECK_DEBOUNCE_MS = 350;

const IDLE_PORT_STATE = Object.freeze({
	status: 'idle',
	available: null,
	message: '',
	port: null,
	conflicts: [],
});

function createPortState(overrides = {}) {
	return {
		...IDLE_PORT_STATE,
		...overrides,
	};
}

/**
 * Returns whether the current live port-check state should block form submission.
 *
 * @param {{status?: string}} state - Port-check state returned by `usePortAvailability`.
 * @returns {boolean} True when the current state represents a blocking validation issue.
 */
export function isPortCheckBlocking(state) {
	return ['checking', 'invalid', 'unavailable'].includes(state?.status);
}

/**
 * Polls the backend for live port availability while a port input is being edited.
 *
 * @param {{port: string | number | null | undefined, label: string, enabled?: boolean, currentPort?: string | number | null | undefined, excludeProjectName?: string | null | undefined, localConflictMessage?: string}} options - Port check options.
 * @returns {{status: string, available: boolean | null, message: string, port: number | null, conflicts: string[]}} Live port-check state for the current input.
 */
export function usePortAvailability({
	port,
	label,
	enabled = true,
	currentPort = null,
	excludeProjectName = null,
	localConflictMessage = '',
}) {
	const [state, setState] = useState(IDLE_PORT_STATE);

	useEffect(() => {
		if (!enabled) {
			setState(IDLE_PORT_STATE);
			return undefined;
		}

		const normalizedPort = String(port ?? '').trim();
		if (!normalizedPort) {
			setState(IDLE_PORT_STATE);
			return undefined;
		}

		if (!/^\d+$/.test(normalizedPort)) {
			setState(
				createPortState({
					status: 'invalid',
					available: false,
					message: `${label} must be a number between 1 and 65535.`,
				}),
			);
			return undefined;
		}

		const parsedPort = Number.parseInt(normalizedPort, 10);
		if (parsedPort < 1 || parsedPort > 65535) {
			setState(
				createPortState({
					status: 'invalid',
					available: false,
					message: `${label} must be a number between 1 and 65535.`,
				}),
			);
			return undefined;
		}

		if (localConflictMessage) {
			setState(
				createPortState({
					status: 'unavailable',
					available: false,
					port: parsedPort,
					message: localConflictMessage,
					conflicts: [localConflictMessage],
				}),
			);
			return undefined;
		}

		if (
			String(currentPort ?? '').trim() &&
			parsedPort === Number.parseInt(String(currentPort).trim(), 10)
		) {
			setState(
				createPortState({
					status: 'available',
					available: true,
					port: parsedPort,
					message: `${label} ${parsedPort} is already assigned to this project.`,
				}),
			);
			return undefined;
		}

		setState(
			createPortState({
				status: 'checking',
				port: parsedPort,
				message: `Checking whether ${label.toLowerCase()} ${parsedPort} is available...`,
			}),
		);

		let cancelled = false;
		const timeoutId = window.setTimeout(async () => {
			try {
				const response = await axios.get(`${API}/system/ports/check`, {
					params: {
						port: parsedPort,
						label,
						excludeProjectName: excludeProjectName || undefined,
					},
				});

				if (cancelled) {
					return;
				}

				const report = response.data;
				setState(
					createPortState({
						status: report.available ? 'available' : 'unavailable',
						available: report.available,
						port: report.port,
						conflicts: report.conflicts || [],
						message: report.available
							? `${label} ${report.port} is available to use.`
							: `${label} ${report.port} is not safe to use. ${(
									report.conflicts || []
								).join(' ')}`,
					}),
				);
			} catch (error) {
				if (cancelled) {
					return;
				}

				setState(
					createPortState({
						status: 'error',
						available: null,
						port: parsedPort,
						message:
							error.response?.data?.error ||
							`Unable to verify ${label.toLowerCase()} right now.`,
					}),
				);
			}
		}, PORT_CHECK_DEBOUNCE_MS);

		return () => {
			cancelled = true;
			window.clearTimeout(timeoutId);
		};
	}, [
		currentPort,
		enabled,
		excludeProjectName,
		label,
		localConflictMessage,
		port,
	]);

	return state;
}
