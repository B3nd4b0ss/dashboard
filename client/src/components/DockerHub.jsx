import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import HubRounded from '@mui/icons-material/HubRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import StopRounded from '@mui/icons-material/StopRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import StorageRounded from '@mui/icons-material/StorageRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import DnsRounded from '@mui/icons-material/DnsRounded';
import MemoryRounded from '@mui/icons-material/MemoryRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import { API_BASE_URL } from '../config/api';
import SurfaceSelect from './SurfaceSelect';
import {
	buildNextTextSearchParams,
	getSearchParamValue,
} from '../utils/searchParams';
import './DockerHub.css';

const API = API_BASE_URL;
const REFRESH_INTERVAL_MS = 12000;
const DOCKER_FILTER_OPTIONS = [
	{
		value: 'all',
		label: 'All runtime',
		description: 'Everything Docker is tracking locally.',
	},
	{
		value: 'running',
		label: 'Running',
		description: 'Only live stacks and containers.',
	},
	{
		value: 'stopped',
		label: 'Stopped',
		description: 'Only offline stacks and containers.',
	},
	{
		value: 'managed',
		label: 'Managed',
		description: 'Resources created through this dashboard.',
	},
];

/**
 * Formats byte counts for Docker stats cards.
 *
 * @param {number} bytes - Raw byte value.
 * @returns {string} Human-readable byte string.
 */
function formatBytes(bytes) {
	if (!bytes) {
		return 'Unknown';
	}

	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

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
 * Converts a Docker stack state into the user-facing badge label.
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
 * Formats exposed host ports for container and stack cards.
 *
 * @param {Array<{hostPort: number, protocol: string}>} hostPorts - Host port mappings returned by the API.
 * @param {string} [emptyLabel='No exposed ports'] - Fallback label when no mappings exist.
 * @returns {string} Human-readable host port list.
 */
function formatHostPorts(hostPorts, emptyLabel = 'No exposed ports') {
	if (!hostPorts || hostPorts.length === 0) {
		return emptyLabel;
	}

	const visiblePorts = hostPorts.slice(0, 3).map((port) => {
		return `${port.hostPort}/${port.protocol}`;
	});

	if (hostPorts.length > 3) {
		visiblePorts.push(`+${hostPorts.length - 3} more`);
	}

	return visiblePorts.join(' • ');
}

/**
 * Checks whether a container matches the active runtime filter in the Docker UI.
 *
 * @param {string} state - Raw container state.
 * @param {boolean} managedByDashboard - Whether the container is dashboard-managed.
 * @param {string} filter - Active filter selected by the user.
 * @returns {boolean} True when the container should remain visible.
 */
function matchesRuntimeFilter(state, managedByDashboard, filter) {
	if (filter === 'all') {
		return true;
	}

	if (filter === 'managed') {
		return managedByDashboard;
	}

	if (filter === 'running') {
		return state === 'running';
	}

	return state === 'stopped';
}

/**
 * Renders the Docker operations screen, including stacks, containers, logs, and image inventory.
 *
 * @returns {JSX.Element} Docker page.
 */
function DockerHub() {
	const [searchParams, setSearchParams] = useSearchParams();
	const [overview, setOverview] = useState(null);
	const [loading, setLoading] = useState(true);
	const [pageError, setPageError] = useState('');
	const query = getSearchParamValue(searchParams, 'q');
	const [stateFilter, setStateFilter] = useState('all');
	const [busyAction, setBusyAction] = useState('');
	const [logsOpen, setLogsOpen] = useState(false);
	const [logsLoading, setLogsLoading] = useState(false);
	const [selectedLogs, setSelectedLogs] = useState(null);

	const loadOverview = async ({ silent = false } = {}) => {
		try {
			const response = await axios.get(`${API}/docker`);
			setOverview(response.data);
			setPageError('');
		} catch (error) {
			if (!silent) {
				setPageError(
					error.response?.data?.error ||
						'Unable to load Docker data right now.',
				);
			}
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadOverview();

		const intervalId = window.setInterval(() => {
			loadOverview({ silent: true });
		}, REFRESH_INTERVAL_MS);

		return () => window.clearInterval(intervalId);
	}, []);

	const runContainerAction = async (containerName, action) => {
		setBusyAction(`${action}:${containerName}`);

		try {
			await axios.post(
				`${API}/docker/containers/${encodeURIComponent(containerName)}/${action}`,
			);
			await loadOverview({ silent: true });
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

	const handleQueryChange = (event) => {
		setSearchParams(
			buildNextTextSearchParams(searchParams, 'q', event.target.value),
			{ replace: true },
		);
	};

	const visibleStacks = useMemo(() => {
		const stacks = overview?.stacks || [];
		const normalizedQuery = query.trim().toLowerCase();

		return stacks.filter((stack) => {
			const matchesQuery = [
				stack.displayName,
				stack.projectName,
				stack.folderPath,
				stack.workingDir,
				...(stack.composeFileNames || []),
				...(stack.services || []).map((service) => service.name),
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase()
				.includes(normalizedQuery);

			const matchesState = matchesRuntimeFilter(
				stack.state,
				stack.managedByDashboard,
				stateFilter,
			);

			return matchesQuery && matchesState;
		});
	}, [overview, query, stateFilter]);

	const visibleStandaloneContainers = useMemo(() => {
		const containers = overview?.standaloneContainers || [];
		const normalizedQuery = query.trim().toLowerCase();

		return containers.filter((container) => {
			const matchesQuery = [
				container.name,
				container.image,
				container.status,
				container.ports,
				container.category,
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase()
				.includes(normalizedQuery);

			const normalizedState =
				container.state === 'running' ? 'running' : 'stopped';
			const matchesState = matchesRuntimeFilter(
				normalizedState,
				container.managedByDashboard,
				stateFilter,
			);

			return matchesQuery && matchesState;
		});
	}, [overview, query, stateFilter]);

	if (loading) {
		return (
			<div className='docker-state-card'>Loading Docker overview...</div>
		);
	}

	return (
		<div className='docker-page'>
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

			<section className='docker-hero'>
				<div>
					<span className='section-tag'>Docker Ops</span>
					<h2>
						Browse Docker by compose folders, then open each YAML
						stack like a project.
					</h2>
					<p>
						Compose services are now grouped into stack folders so
						database and Adminer pairs no longer feel split apart.
						Open a folder to inspect its components on a dedicated
						page.
					</p>
				</div>

				<div className='docker-hero-actions'>
					<button
						type='button'
						className='secondary-action'
						onClick={() => loadOverview()}>
						<RefreshRounded fontSize='small' />
						Refresh
					</button>
				</div>
			</section>

			{pageError && <div className='panel-error'>{pageError}</div>}

			{!overview?.available ? (
				<div className='docker-state-card warning'>
					<WarningAmberRounded />
					<div>
						<strong>Docker is not running.</strong>
						<p>
							Start Docker Desktop first, then refresh this page
							to load containers and images.
						</p>
					</div>
				</div>
			) : (
				<>
					<section className='docker-metrics'>
						<article className='docker-metric-card'>
							<div className='docker-metric-icon green'>
								<CheckCircleRounded />
							</div>
							<div>
								<span>Engine</span>
								<strong>
									{overview.info?.serverVersion || 'Ready'}
								</strong>
								<p>
									{overview.info?.operatingSystem ||
										'Docker daemon online'}
								</p>
							</div>
						</article>
						<article className='docker-metric-card'>
							<div className='docker-metric-icon blue'>
								<FolderRounded />
							</div>
							<div>
								<span>Compose Folders</span>
								<strong>{overview.summary?.stacks || 0}</strong>
								<p>
									Grouped stacks detected from compose labels
								</p>
							</div>
						</article>
						<article className='docker-metric-card'>
							<div className='docker-metric-icon amber'>
								<HubRounded />
							</div>
							<div>
								<span>Stack Services</span>
								<strong>
									{overview.summary?.stackServices || 0}
								</strong>
								<p>
									Components living inside grouped YAML
									folders
								</p>
							</div>
						</article>
						<article className='docker-metric-card'>
							<div className='docker-metric-icon slate'>
								<Inventory2Rounded />
							</div>
							<div>
								<span>Standalone Containers</span>
								<strong>
									{overview.summary?.standaloneContainers ||
										0}
								</strong>
								<p>
									Containers not attached to a compose project
								</p>
							</div>
						</article>
					</section>

					<section className='docker-info-grid'>
						<article className='docker-info-card'>
							<div className='panel-header'>
								<span className='section-tag muted'>
									Daemon
								</span>
								<h3>Engine details</h3>
							</div>
							<div className='docker-info-list'>
								<div className='docker-info-row'>
									<span>Name</span>
									<strong>
										{overview.info?.name || 'Unknown'}
									</strong>
								</div>
								<div className='docker-info-row'>
									<span>Operating system</span>
									<strong>
										{overview.info?.operatingSystem ||
											'Unknown'}
									</strong>
								</div>
								<div className='docker-info-row'>
									<span>Architecture</span>
									<strong>
										{overview.info?.architecture ||
											'Unknown'}
									</strong>
								</div>
								<div className='docker-info-row'>
									<span>CPUs</span>
									<strong>{overview.info?.cpus || 0}</strong>
								</div>
								<div className='docker-info-row'>
									<span>Memory</span>
									<strong>
										{formatBytes(
											overview.info?.memoryTotal,
										)}
									</strong>
								</div>
							</div>
						</article>

						<article className='docker-info-card'>
							<div className='panel-header panel-header-spread'>
								<div>
									<span className='section-tag muted'>
										Compose Folders
									</span>
									<h3>YAML project view</h3>
								</div>
								<div className='docker-toolbar'>
									<label className='board-search'>
										<SearchRounded fontSize='small' />
										<input
											className='search-input'
											placeholder='Search folders, files, or services'
											value={query}
											onChange={handleQueryChange}
										/>
									</label>
									<SurfaceSelect
										value={stateFilter}
										onChange={setStateFilter}
										options={DOCKER_FILTER_OPTIONS}
										variant='compact'
										align='right'
										className='docker-filter-select'
									/>
								</div>
							</div>

							<div className='docker-stack-grid'>
								{visibleStacks.length > 0 ? (
									visibleStacks.map((stack) => (
										<article
											key={stack.id}
											className='docker-stack-card'>
											<div className='docker-stack-head'>
												<div className='docker-folder-icon'>
													<FolderRounded />
												</div>
												<div className='docker-stack-copy'>
													<div className='docker-chip-row'>
														<span
															className={`docker-state-pill state-${stack.state}`}>
															{getStackStateLabel(
																stack.state,
															)}
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
													<h3>{stack.displayName}</h3>
													<p>
														{stack.composeFileNames?.join(
															', ',
														) || 'Compose project'}
													</p>
												</div>
											</div>

											<div className='docker-stack-summary'>
												<div className='docker-stack-summary-tile'>
													<span>Services</span>
													<strong>
														{stack.serviceCount}
													</strong>
												</div>
												<div className='docker-stack-summary-tile'>
													<span>Running</span>
													<strong>
														{stack.runningServices}
													</strong>
												</div>
												<div className='docker-stack-summary-tile'>
													<span>Ports</span>
													<strong>
														{stack.hostPorts
															?.length || 0}
													</strong>
												</div>
											</div>

											<div className='docker-stack-path'>
												<span>Folder</span>
												<strong>
													{stack.folderPath ||
														stack.workingDir ||
														'Unknown folder'}
												</strong>
											</div>

											{stack.composeFileNames?.length >
												0 && (
												<div className='docker-stack-file-row'>
													{stack.composeFileNames.map(
														(fileName) => (
															<span
																key={`${stack.id}-${fileName}`}
																className='docker-file-pill'>
																{fileName}
															</span>
														),
													)}
												</div>
											)}

											<div className='docker-stack-actions'>
												<Link
													to={`/docker/${encodeURIComponent(stack.id)}`}
													className='primary-action'>
													<ArrowOutwardRounded fontSize='small' />
													Open folder
												</Link>
											</div>
										</article>
									))
								) : (
									<div className='docker-empty-card'>
										<strong>
											No compose folders match this view.
										</strong>
										<p>
											Compose-based services will appear
											here as grouped YAML folders instead
											of separate flat containers.
										</p>
									</div>
								)}
							</div>
						</article>
					</section>

					<section className='docker-info-card'>
						<div className='panel-header panel-header-spread'>
							<div>
								<span className='section-tag muted'>
									Standalone
								</span>
								<h3>Containers outside compose folders</h3>
							</div>
							<span className='docker-image-count'>
								{overview.standaloneContainers?.length || 0}{' '}
								containers
							</span>
						</div>

						<div className='docker-container-grid'>
							{visibleStandaloneContainers.length > 0 ? (
								visibleStandaloneContainers.map((container) => (
									<article
										key={container.id}
										className='docker-container-card'>
										<div className='docker-container-head'>
											<div>
												<div className='docker-chip-row'>
													<span
														className={`docker-state-pill state-${container.state}`}>
														{getContainerStateLabel(
															container.state,
														)}
													</span>
													<span className='docker-type-pill'>
														{getCategoryLabel(
															container.category,
														)}
													</span>
													{container.managedByDashboard && (
														<span className='docker-type-pill managed'>
															Managed
														</span>
													)}
												</div>
												<h3>{container.name}</h3>
												<p>{container.image}</p>
											</div>
										</div>

										<div className='docker-stat-grid'>
											<div className='docker-stat-item'>
												<DnsRounded fontSize='inherit' />
												<span>
													{container.ports ||
														'No exposed ports'}
												</span>
											</div>
											<div className='docker-stat-item'>
												<MemoryRounded fontSize='inherit' />
												<span>
													{container.stats?.memory ||
														'No live memory stats'}
												</span>
											</div>
											<div className='docker-stat-item'>
												<HubRounded fontSize='inherit' />
												<span>
													CPU{' '}
													{container.stats?.cpu ||
														'N/A'}
												</span>
											</div>
										</div>

										<div className='docker-meta-list'>
											<div className='docker-meta-row'>
												<span>Status</span>
												<strong>
													{container.status}
												</strong>
											</div>
											<div className='docker-meta-row'>
												<span>Networks</span>
												<strong>
													{container.networks ||
														'Default'}
												</strong>
											</div>
										</div>

										<div className='docker-card-actions'>
											{container.state === 'running' ? (
												<button
													type='button'
													className='danger-button'
													disabled={
														busyAction ===
														`stop:${container.name}`
													}
													onClick={() =>
														runContainerAction(
															container.name,
															'stop',
														)
													}>
													<StopRounded fontSize='small' />
													{busyAction ===
													`stop:${container.name}`
														? 'Stopping...'
														: 'Stop'}
												</button>
											) : (
												<button
													type='button'
													className='success-button'
													disabled={
														busyAction ===
														`start:${container.name}`
													}
													onClick={() =>
														runContainerAction(
															container.name,
															'start',
														)
													}>
													<PlayArrowRounded fontSize='small' />
													{busyAction ===
													`start:${container.name}`
														? 'Starting...'
														: 'Start'}
												</button>
											)}

											<button
												type='button'
												className='ghost-button'
												disabled={
													busyAction ===
													`restart:${container.name}`
												}
												onClick={() =>
													runContainerAction(
														container.name,
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
													openLogs(container.name)
												}>
												<DescriptionRounded fontSize='small' />
												Logs
											</button>
										</div>
									</article>
								))
							) : (
								<div className='docker-empty-card'>
									<strong>
										No standalone containers match this
										view.
									</strong>
									<p>
										Everything visible right now is already
										grouped into compose folders, or the
										current filters are hiding standalone
										containers.
									</p>
								</div>
							)}
						</div>
					</section>

					<section className='docker-images-card'>
						<div className='panel-header panel-header-spread'>
							<div>
								<span className='section-tag muted'>
									Images
								</span>
								<h3>Local image catalog</h3>
							</div>
							<span className='docker-image-count'>
								{overview.images?.length || 0} images
							</span>
						</div>
						<div className='docker-image-grid'>
							{overview.images?.length > 0 ? (
								overview.images.slice(0, 12).map((image) => (
									<article
										key={image.id}
										className='docker-image-card'>
										<strong>{image.label}</strong>
										<p>{image.size}</p>
										<span>{image.createdSince}</span>
									</article>
								))
							) : (
								<div className='docker-empty-card'>
									<strong>No images found.</strong>
									<p>
										Pull or build an image to see it appear
										here.
									</p>
								</div>
							)}
						</div>
					</section>
				</>
			)}
		</div>
	);
}

export default DockerHub;
