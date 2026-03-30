import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import FolderRounded from '@mui/icons-material/FolderRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import StopRounded from '@mui/icons-material/StopRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import DnsRounded from '@mui/icons-material/DnsRounded';
import MemoryRounded from '@mui/icons-material/MemoryRounded';
import HubRounded from '@mui/icons-material/HubRounded';
import StorageRounded from '@mui/icons-material/StorageRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { API_BASE_URL } from '../config/api';
import './DockerHub.css';

const API = API_BASE_URL;
const REFRESH_INTERVAL_MS = 12000;

/**
 * Converts a Docker container state into the user-facing badge label.
 *
 * @param {string} state - Raw Docker container state.
 * @returns {string} User-facing status label.
 */
function getContainerStateLabel(state) {
	switch (state) {
		case 'running':
			return 'Running';
		case 'exited':
			return 'Stopped';
		case 'paused':
			return 'Paused';
		case 'dead':
			return 'Dead';
		default:
			return state ? state[0].toUpperCase() + state.slice(1) : 'Unknown';
	}
}

/**
 * Converts an aggregate stack state into the user-facing badge label.
 *
 * @param {string} state - Aggregate stack state.
 * @returns {string} User-facing status label.
 */
function getStackStateLabel(state) {
	switch (state) {
		case 'running':
			return 'Running';
		case 'partial':
			return 'Attention';
		default:
			return 'Stopped';
	}
}

/**
 * Converts the dashboard's internal container category into display text.
 *
 * @param {string} category - Container category identifier.
 * @returns {string} Human-readable category label.
 */
function getCategoryLabel(category) {
	switch (category) {
		case 'database':
			return 'Database';
		case 'client':
			return 'Client';
		default:
			return 'Runtime';
	}
}

/**
 * Formats exposed host ports for the stack detail cards.
 *
 * @param {Array<{hostPort: number, protocol: string}>} hostPorts - Host port mappings returned by the API.
 * @param {string} [emptyLabel='No exposed ports'] - Fallback label when no mappings exist.
 * @returns {string} Human-readable host port list.
 */
function formatHostPorts(hostPorts, emptyLabel = 'No exposed ports') {
	if (!hostPorts || hostPorts.length === 0) {
		return emptyLabel;
	}

	return hostPorts
		.map((port) => `${port.hostPort}/${port.protocol}`)
		.join(' • ');
}

/**
 * Renders the detail page for a single Docker compose stack.
 *
 * @returns {JSX.Element} Docker stack detail page.
 */
function DockerStackDetail() {
	const { stackId } = useParams();
	const [stack, setStack] = useState(null);
	const [loading, setLoading] = useState(true);
	const [pageError, setPageError] = useState('');
	const [busyAction, setBusyAction] = useState('');
	const [logsOpen, setLogsOpen] = useState(false);
	const [logsLoading, setLogsLoading] = useState(false);
	const [selectedLogs, setSelectedLogs] = useState(null);

	const loadStack = async ({ silent = false } = {}) => {
		try {
			const response = await axios.get(
				`${API}/docker/stacks/${encodeURIComponent(stackId)}`,
			);
			setStack(response.data);
			setPageError('');
		} catch (error) {
			if (!silent) {
				setPageError(
					error.response?.data?.error ||
						'Unable to load Docker stack details right now.',
				);
			}
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		setLoading(true);
		loadStack();

		const intervalId = window.setInterval(() => {
			loadStack({ silent: true });
		}, REFRESH_INTERVAL_MS);

		return () => window.clearInterval(intervalId);
	}, [stackId]);

	const runContainerAction = async (containerName, action) => {
		setBusyAction(`${action}:${containerName}`);

		try {
			await axios.post(
				`${API}/docker/containers/${encodeURIComponent(containerName)}/${action}`,
			);
			await loadStack({ silent: true });
		} catch (error) {
			alert(
				error.response?.data?.error || `Failed to ${action} container.`,
			);
		} finally {
			setBusyAction('');
		}
	};

	const openLogs = async (containerName) => {
		setLogsOpen(true);
		setLogsLoading(true);
		setSelectedLogs({ containerName, logs: '' });

		try {
			const response = await axios.get(
				`${API}/docker/containers/${encodeURIComponent(containerName)}/logs`,
				{
					params: { tail: 180 },
				},
			);
			setSelectedLogs(response.data);
		} catch (error) {
			setSelectedLogs({
				containerName,
				logs:
					error.response?.data?.error ||
					'Unable to load container logs right now.',
			});
		} finally {
			setLogsLoading(false);
		}
	};

	if (loading) {
		return <div className='docker-state-card'>Loading Docker stack...</div>;
	}

	return (
		<div className='docker-page docker-stack-detail-page'>
			{logsOpen && (
				<div
					className='docker-modal-overlay'
					onClick={() => setLogsOpen(false)}>
					<div
						className='docker-modal-card'
						onClick={(event) => event.stopPropagation()}>
						<div className='docker-modal-head'>
							<div>
								<span className='section-tag muted'>
									Container Logs
								</span>
								<h3>{selectedLogs?.containerName}</h3>
							</div>
							<button
								type='button'
								className='ghost-button'
								onClick={() => setLogsOpen(false)}>
								Close
							</button>
						</div>
						<pre className='docker-log-output'>
							{logsLoading
								? 'Loading logs...'
								: selectedLogs?.logs ||
									'No logs returned for this container.'}
						</pre>
					</div>
				</div>
			)}

			<Link to='/docker' className='docker-detail-back-link'>
				<ArrowBackRounded fontSize='small' />
				Back to Docker folders
			</Link>

			{pageError ? (
				<div className='panel-error'>{pageError}</div>
			) : stack ? (
				<>
					<section className='docker-stack-hero'>
						<div className='docker-stack-hero-copy'>
							<div className='docker-stack-hero-mark'>
								<FolderRounded />
							</div>
							<div>
								<div className='docker-chip-row'>
									<span
										className={`docker-state-pill state-${stack.state}`}>
										{getStackStateLabel(stack.state)}
									</span>
									<span className='docker-type-pill'>
										YAML Folder
									</span>
									{stack.managedByDashboard && (
										<span className='docker-type-pill managed'>
											Managed
										</span>
									)}
								</div>
								<h2>{stack.displayName}</h2>
								<p>
									{stack.folderPath ||
										stack.workingDir ||
										'Unknown folder path'}
								</p>
							</div>
						</div>

						<div className='docker-stack-hero-meta'>
							<div className='docker-stack-hero-meta-row'>
								<span>Compose files</span>
								<strong>
									{stack.composeFileNames?.join(', ') ||
										'Unknown'}
								</strong>
							</div>
							<div className='docker-stack-hero-meta-row'>
								<span>Project id</span>
								<strong>{stack.projectName}</strong>
							</div>
							<div className='docker-stack-hero-meta-row'>
								<span>Ports</span>
								<strong>
									{formatHostPorts(stack.hostPorts)}
								</strong>
							</div>
						</div>
					</section>

					<section className='docker-metrics'>
						<article className='docker-metric-card'>
							<div className='docker-metric-icon blue'>
								<StorageRounded />
							</div>
							<div>
								<span>Services</span>
								<strong>{stack.serviceCount || 0}</strong>
								<p>
									Components grouped under this compose folder
								</p>
							</div>
						</article>
						<article className='docker-metric-card'>
							<div className='docker-metric-icon green'>
								<CheckCircleRounded />
							</div>
							<div>
								<span>Running</span>
								<strong>{stack.runningServices || 0}</strong>
								<p>Services currently online</p>
							</div>
						</article>
						<article className='docker-metric-card'>
							<div className='docker-metric-icon amber'>
								<WarningAmberRounded />
							</div>
							<div>
								<span>Stopped</span>
								<strong>{stack.stoppedServices || 0}</strong>
								<p>Services that still need attention</p>
							</div>
						</article>
						<article className='docker-metric-card'>
							<div className='docker-metric-icon slate'>
								<DnsRounded />
							</div>
							<div>
								<span>Exposed Ports</span>
								<strong>{stack.hostPorts?.length || 0}</strong>
								<p>{formatHostPorts(stack.hostPorts)}</p>
							</div>
						</article>
					</section>

					<section className='docker-info-card'>
						<div className='panel-header panel-header-spread'>
							<div>
								<span className='section-tag muted'>
									Components
								</span>
								<h3>Services inside this folder</h3>
							</div>
							<span className='docker-image-count'>
								{stack.services?.length || 0} services
							</span>
						</div>

						<div className='docker-container-grid'>
							{stack.services?.map((service) => (
								<article
									key={service.id}
									className='docker-container-card'>
									<div className='docker-container-head'>
										<div>
											<div className='docker-chip-row'>
												<span
													className={`docker-state-pill state-${service.state}`}>
													{getContainerStateLabel(
														service.state,
													)}
												</span>
												<span className='docker-type-pill'>
													{service.compose?.service ||
														getCategoryLabel(
															service.category,
														)}
												</span>
												{service.managedByDashboard && (
													<span className='docker-type-pill managed'>
														Managed
													</span>
												)}
											</div>
											<h3>
												{service.compose?.service ||
													service.name}
											</h3>
											<p>{service.image}</p>
										</div>
									</div>

									<div className='docker-stat-grid'>
										<div className='docker-stat-item'>
											<DnsRounded fontSize='inherit' />
											<span>
												{service.ports ||
													'No exposed ports'}
											</span>
										</div>
										<div className='docker-stat-item'>
											<MemoryRounded fontSize='inherit' />
											<span>
												{service.stats?.memory ||
													'No live memory stats'}
											</span>
										</div>
										<div className='docker-stat-item'>
											<HubRounded fontSize='inherit' />
											<span>
												CPU{' '}
												{service.stats?.cpu || 'N/A'}
											</span>
										</div>
									</div>

									<div className='docker-meta-list'>
										<div className='docker-meta-row'>
											<span>Container</span>
											<strong>{service.name}</strong>
										</div>
										<div className='docker-meta-row'>
											<span>Status</span>
											<strong>{service.status}</strong>
										</div>
										<div className='docker-meta-row'>
											<span>Networks</span>
											<strong>
												{service.networks || 'Default'}
											</strong>
										</div>
									</div>

									<div className='docker-card-actions'>
										{service.state === 'running' ? (
											<button
												type='button'
												className='danger-button'
												disabled={
													busyAction ===
													`stop:${service.name}`
												}
												onClick={() =>
													runContainerAction(
														service.name,
														'stop',
													)
												}>
												<StopRounded fontSize='small' />
												{busyAction ===
												`stop:${service.name}`
													? 'Stopping...'
													: 'Stop'}
											</button>
										) : (
											<button
												type='button'
												className='success-button'
												disabled={
													busyAction ===
													`start:${service.name}`
												}
												onClick={() =>
													runContainerAction(
														service.name,
														'start',
													)
												}>
												<PlayArrowRounded fontSize='small' />
												{busyAction ===
												`start:${service.name}`
													? 'Starting...'
													: 'Start'}
											</button>
										)}

										<button
											type='button'
											className='ghost-button'
											disabled={
												busyAction ===
												`restart:${service.name}`
											}
											onClick={() =>
												runContainerAction(
													service.name,
													'restart',
												)
											}>
											<RestartAltRounded fontSize='small' />
											Restart
										</button>

										<button
											type='button'
											className='ghost-button'
											onClick={() =>
												openLogs(service.name)
											}>
											<DescriptionRounded fontSize='small' />
											Logs
										</button>
									</div>
								</article>
							))}
						</div>
					</section>
				</>
			) : (
				<div className='docker-state-card warning'>
					<WarningAmberRounded />
					<div>
						<strong>This Docker folder could not be found.</strong>
						<p>
							The compose project may have been removed or renamed
							since the last refresh.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}

export default DockerStackDetail;
