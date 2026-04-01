import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import MonitorHeartRounded from '@mui/icons-material/MonitorHeartRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import HubRounded from '@mui/icons-material/HubRounded';
import SpeedRounded from '@mui/icons-material/SpeedRounded';
import MemoryRounded from '@mui/icons-material/MemoryRounded';
import { API_BASE_URL } from '../config/api';
import { getSearchParamValue } from '../utils/searchParams';
import {
	getProjectScaffold,
	getTemplateLabel,
	hasWebsiteMonitoring as hasWebsiteProjectMonitoring,
} from '../utils/projectPresentation';
import './Monitoring.css';

const API = API_BASE_URL;
const REFRESH_INTERVAL_MS = 10000;

function formatLatency(value) {
	if (!Number.isFinite(value) || value <= 0) {
		return 'Waiting';
	}

	if (value >= 1000) {
		return `${(value / 1000).toFixed(1)}s`;
	}

	return `${Math.round(value)} ms`;
}

function formatDuration(value) {
	if (!Number.isFinite(value) || value <= 0) {
		return 'Just started';
	}

	const totalSeconds = Math.floor(value / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}

	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}

	return `${seconds}s`;
}

function formatBytes(bytes) {
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return '0 B';
	}

	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
	return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatPercent(value) {
	if (!Number.isFinite(value) || value <= 0) {
		return '0%';
	}

	return `${value >= 10 ? Math.round(value) : value.toFixed(1)}%`;
}

function getProjectCpuPercent(project = {}) {
	return Number.isFinite(project.monitoring?.cpuPercent)
		? project.monitoring.cpuPercent
		: 0;
}

function getProjectMemoryBytes(project = {}) {
	return Number.isFinite(project.monitoring?.memoryBytes)
		? project.monitoring.memoryBytes
		: 0;
}

function getTopMetricProject(projects, selector) {
	return projects.reduce(
		(best, project) => {
			const value = selector(project);

			if (value > best.value) {
				return { project, value };
			}

			return best;
		},
		{ project: null, value: 0 },
	);
}

function getMonitoringStatusLabel(status) {
	switch (status) {
		case 'healthy':
			return 'Healthy';
		case 'degraded':
			return 'Degraded';
		case 'starting':
			return 'Starting';
		case 'unknown':
			return 'Checking';
		default:
			return 'Offline';
	}
}

function getMonitoringTone(status) {
	switch (status) {
		case 'healthy':
			return 'healthy';
		case 'degraded':
			return 'degraded';
		case 'starting':
		case 'unknown':
			return 'starting';
		default:
			return 'offline';
	}
}

function getRuntimeStatusLabel(status) {
	switch (status) {
		case 'running':
			return 'Running';
		case 'partial':
			return 'Attention';
		default:
			return 'Stopped';
	}
}

function getProjectMonitoringSearchText(project = {}) {
	const monitoring = project.monitoring || {};
	const services = monitoring.services || {};

	return [
		project.name,
		project.status,
		project.frontend,
		project.backend,
		project.frontendUrl,
		project.backendUrl,
		monitoring.status,
		monitoring.lastCheckedAt,
		services.frontend?.healthStatus,
		services.frontend?.lastError,
		services.backend?.healthStatus,
		services.backend?.lastError,
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
}

function buildProjectAlerts(project = {}) {
	const monitoring = project.monitoring || {};
	const monitoringServices = monitoring.services || {};
	const alerts = [];

	if (monitoring.crashCount > 0) {
		alerts.push(
			`${monitoring.crashCount} crash ${
				monitoring.crashCount === 1 ? 'was' : 'were'
			} recorded recently.`,
		);
	}

	['frontend', 'backend'].forEach((serviceKey) => {
		const service = monitoringServices[serviceKey];
		if (service?.healthStatus === 'degraded') {
			alerts.push(
				service.lastError ||
					`${
						serviceKey[0].toUpperCase() + serviceKey.slice(1)
					} health checks are failing.`,
			);
		}
	});

	if (alerts.length === 0 && project.status === 'partial') {
		alerts.push('One or more managed services currently need attention.');
	}

	return alerts.slice(0, 2);
}

function buildServiceEntries(project = {}) {
	const runtimeServices = project.runtime?.services || {};
	const monitoringServices = project.monitoring?.services || {};

	return [
		project.frontend
			? {
					key: 'frontend',
					label: 'Frontend',
					Icon: PublicRounded,
					template: getTemplateLabel(project.frontend),
					port: project.frontendPort,
					running: runtimeServices.frontend?.running,
					url: project.frontendUrl,
					monitoring: monitoringServices.frontend || {},
				}
			: null,
		project.backend &&
		(runtimeServices.backend ||
			monitoringServices.backend ||
			project.backendPort)
			? {
					key: 'backend',
					label: 'Backend',
					Icon: HubRounded,
					template: getTemplateLabel(project.backend),
					port: project.backendPort,
					running: runtimeServices.backend?.running,
					url: project.backendUrl,
					monitoring: monitoringServices.backend || {},
				}
			: null,
	].filter(Boolean);
}

/**
 * Renders a monitoring workspace for managed website projects.
 *
 * @returns {JSX.Element} Monitoring page.
 */
function Monitoring() {
	const [searchParams] = useSearchParams();
	const [projects, setProjects] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const query = getSearchParamValue(searchParams, 'q').trim().toLowerCase();

	const loadProjects = async ({ silent = false } = {}) => {
		try {
			const response = await axios.get(`${API}/projects`);
			setProjects(response.data);
			setError('');
		} catch (loadError) {
			if (!silent) {
				setError(
					loadError.response?.data?.error ||
						'Unable to load monitoring data right now.',
				);
			}
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadProjects();

		const intervalId = window.setInterval(() => {
			loadProjects({ silent: true });
		}, REFRESH_INTERVAL_MS);

		return () => window.clearInterval(intervalId);
	}, []);

	const monitoredEntries = useMemo(() => {
		return projects
			.filter((project) => hasWebsiteProjectMonitoring(project))
			.filter((project) => {
				if (!query) {
					return true;
				}

				return getProjectMonitoringSearchText(project).includes(query);
			})
			.map((project) => ({
				project,
				alerts: buildProjectAlerts(project),
			}))
			.sort((left, right) => {
				const leftNeedsAttention =
					left.alerts.length > 0 ||
					left.project.monitoring?.status === 'degraded' ||
					left.project.status === 'partial';
				const rightNeedsAttention =
					right.alerts.length > 0 ||
					right.project.monitoring?.status === 'degraded' ||
					right.project.status === 'partial';

				if (leftNeedsAttention !== rightNeedsAttention) {
					return (
						Number(rightNeedsAttention) - Number(leftNeedsAttention)
					);
				}

				return left.project.name.localeCompare(right.project.name);
			});
	}, [projects, query]);

	const monitoredProjects = monitoredEntries.map((entry) => entry.project);
	const attentionCount = monitoredEntries.filter((entry) => {
		return (
			entry.alerts.length > 0 ||
			entry.project.monitoring?.status === 'degraded' ||
			entry.project.status === 'partial'
		);
	}).length;
	const healthyCount = monitoredProjects.filter((project) => {
		return project.monitoring?.status === 'healthy';
	}).length;
	const totalCpuPercent = monitoredProjects.reduce((total, project) => {
		return total + getProjectCpuPercent(project);
	}, 0);
	const totalMemoryBytes = monitoredProjects.reduce((total, project) => {
		return total + getProjectMemoryBytes(project);
	}, 0);
	const topCpuProject = getTopMetricProject(
		monitoredProjects,
		getProjectCpuPercent,
	);
	const topMemoryProject = getTopMetricProject(
		monitoredProjects,
		getProjectMemoryBytes,
	);
	const latencyValues = monitoredProjects
		.map((project) => project.monitoring?.averageResponseTimeMs)
		.filter((value) => Number.isFinite(value) && value > 0);
	const averageLatency =
		latencyValues.length > 0
			? latencyValues.reduce((total, value) => total + value, 0) /
				latencyValues.length
			: null;
	const totalFailedChecks = monitoredProjects.reduce((total, project) => {
		return total + (project.monitoring?.failedRequestCount || 0);
	}, 0);
	const totalRestartCount = monitoredProjects.reduce((total, project) => {
		return total + (project.monitoring?.restartCount || 0);
	}, 0);

	if (loading) {
		return (
			<div className='monitoring-state-card'>
				Loading monitoring workspace...
			</div>
		);
	}

	return (
		<div className='monitoring-page'>
			<section className='monitoring-hero'>
				<div className='monitoring-hero-copy'>
					<span className='monitoring-section-tag'>
						Runtime signals
					</span>
					<h2>
						Keep service health visible from one dedicated space.
					</h2>
					<p>
						This page tracks projects with a frontend and
						dashboard-managed monitoring. Use the shared search bar
						above to filter by project name, status, or service
						errors while keeping total CPU, RAM, and individual app
						telemetry in one place.
					</p>
				</div>

				<div className='monitoring-hero-actions'>
					<button
						type='button'
						className='monitoring-secondary-button'
						onClick={() => loadProjects()}
					>
						<RefreshRounded fontSize='small' />
						Refresh
					</button>
				</div>
			</section>

			{error && (
				<div className='monitoring-alert-banner error'>{error}</div>
			)}

			<section className='monitoring-metrics'>
				<article className='monitoring-metric-card'>
					<div className='monitoring-metric-icon blue'>
						<MonitorHeartRounded />
					</div>
					<div>
						<span>Monitored projects</span>
						<strong>{monitoredProjects.length}</strong>
						<p>
							Website projects currently reporting runtime health.
						</p>
					</div>
				</article>
				<article className='monitoring-metric-card'>
					<div className='monitoring-metric-icon green'>
						<CheckCircleRounded />
					</div>
					<div>
						<span>Healthy now</span>
						<strong>{healthyCount}</strong>
						<p>
							Projects whose latest top-level monitoring state is
							healthy.
						</p>
					</div>
				</article>
				<article className='monitoring-metric-card'>
					<div className='monitoring-metric-icon amber'>
						<WarningAmberRounded />
					</div>
					<div>
						<span>Need attention</span>
						<strong>{attentionCount}</strong>
						<p>
							Projects with degraded checks, crashes, or partial
							runtime state.
						</p>
					</div>
				</article>
				<article className='monitoring-metric-card'>
					<div className='monitoring-metric-icon blue'>
						<SpeedRounded />
					</div>
					<div>
						<span>Total CPU usage</span>
						<strong>{formatPercent(totalCpuPercent)}</strong>
						<p>
							{topCpuProject.project
								? `${topCpuProject.project.name} is highest at ${formatPercent(topCpuProject.value)}.`
								: 'No active CPU telemetry yet.'}
						</p>
					</div>
				</article>
				<article className='monitoring-metric-card'>
					<div className='monitoring-metric-icon amber'>
						<MemoryRounded />
					</div>
					<div>
						<span>Total RAM usage</span>
						<strong>{formatBytes(totalMemoryBytes)}</strong>
						<p>
							{topMemoryProject.project
								? `${topMemoryProject.project.name} is using ${formatBytes(topMemoryProject.value)}.`
								: 'No active memory telemetry yet.'}
						</p>
					</div>
				</article>
				<article className='monitoring-metric-card'>
					<div className='monitoring-metric-icon slate'>
						<ScheduleRounded />
					</div>
					<div>
						<span>Average response</span>
						<strong>{formatLatency(averageLatency)}</strong>
						<p>
							{totalFailedChecks} failed checks and{' '}
							{totalRestartCount} restarts across monitored apps.
						</p>
					</div>
				</article>
			</section>

			<section
				className={`monitoring-alert-banner ${
					attentionCount > 0 ? 'warning' : 'healthy'
				}`}
			>
				{attentionCount > 0 ? (
					<>
						<WarningAmberRounded fontSize='small' />
						<div>
							<strong>
								{attentionCount} monitored project
								{attentionCount === 1 ? '' : 's'} currently need
								attention.
							</strong>
							<p>
								Review degraded services, recent crashes, and
								failed checks below to see which runtime needs a
								closer look first.
							</p>
						</div>
					</>
				) : (
					<>
						<CheckCircleRounded fontSize='small' />
						<div>
							<strong>Everything looks healthy right now.</strong>
							<p>
								All monitored projects are reporting healthy
								service states on the latest refresh.
							</p>
						</div>
					</>
				)}
			</section>

			{monitoredEntries.length === 0 ? (
				<div className='monitoring-state-card empty'>
					<strong>
						No monitored projects match the current view.
					</strong>
					<p>
						Create or start a website project with dashboard-managed
						services to populate this monitoring workspace.
					</p>
					<Link to='/projects' className='monitoring-primary-link'>
						<ArrowOutwardRounded fontSize='small' />
						Open projects
					</Link>
				</div>
			) : (
				<section className='monitoring-project-grid'>
					{monitoredEntries.map(({ project, alerts }) => {
						const monitoring = project.monitoring || {};
						const services = buildServiceEntries(project);
						const scaffold = getProjectScaffold(project);

						return (
							<article
								key={project.name}
								className='monitoring-project-card'
							>
								<div className='monitoring-project-head'>
									<div className='monitoring-project-copy'>
										<div className='monitoring-chip-row'>
											<span
												className={`monitoring-runtime-pill status-${project.status}`}
											>
												{getRuntimeStatusLabel(
													project.status,
												)}
											</span>
											<span
												className={`monitoring-health-pill tone-${getMonitoringTone(
													monitoring.status,
												)}`}
											>
												<MonitorHeartRounded fontSize='inherit' />
												{getMonitoringStatusLabel(
													monitoring.status,
												)}
											</span>
										</div>
										<h3>{project.name}</h3>
										<p>{scaffold.description}</p>
									</div>

									<div className='monitoring-project-actions'>
										<Link
											to={`/projects/${encodeURIComponent(project.name)}`}
											className='monitoring-primary-link'
										>
											<ArrowOutwardRounded fontSize='small' />
											Open project
										</Link>
										{project.frontendUrl && (
											<a
												href={project.frontendUrl}
												target='_blank'
												rel='noopener noreferrer'
												className='monitoring-quiet-link'
											>
												Frontend
											</a>
										)}
										{project.backendUrl && (
											<a
												href={project.backendUrl}
												target='_blank'
												rel='noopener noreferrer'
												className='monitoring-quiet-link'
											>
												Backend
											</a>
										)}
									</div>
								</div>

								<div className='monitoring-summary-grid'>
									<div className='monitoring-summary-card'>
										<span>CPU load</span>
										<strong>
											{formatPercent(
												monitoring.cpuPercent,
											)}
										</strong>
									</div>
									<div className='monitoring-summary-card'>
										<span>Memory</span>
										<strong>
											{formatBytes(
												monitoring.memoryBytes,
											)}
										</strong>
									</div>
									<div className='monitoring-summary-card'>
										<span>Average response</span>
										<strong>
											{project.status === 'stopped'
												? 'Offline'
												: formatLatency(
														monitoring.averageResponseTimeMs,
													)}
										</strong>
									</div>
									<div className='monitoring-summary-card'>
										<span>Failed checks</span>
										<strong>
											{monitoring.failedRequestCount || 0}
										</strong>
									</div>
									<div className='monitoring-summary-card'>
										<span>Total restarts</span>
										<strong>
											{monitoring.restartCount || 0}
										</strong>
									</div>
									<div className='monitoring-summary-card'>
										<span>Last health check</span>
										<strong>
											{monitoring.lastCheckedAt
												? new Date(
														monitoring.lastCheckedAt,
													).toLocaleString()
												: 'No checks yet'}
										</strong>
									</div>
								</div>

								{alerts.length > 0 && (
									<div className='monitoring-inline-alerts'>
										{alerts.map((alert) => (
											<div
												key={`${project.name}-${alert}`}
												className='monitoring-inline-alert'
											>
												<WarningAmberRounded fontSize='small' />
												<span>{alert}</span>
											</div>
										))}
									</div>
								)}

								<div className='monitoring-service-grid'>
									{services.map((service) => {
										const ServiceIcon = service.Icon;
										const healthTone = getMonitoringTone(
											service.monitoring?.healthStatus,
										);

										return (
											<div
												key={`${project.name}-${service.key}`}
												className='monitoring-service-card'
											>
												<div className='monitoring-service-head'>
													<div className='monitoring-service-copy'>
														<span className='monitoring-service-kind'>
															<ServiceIcon fontSize='inherit' />
															{service.label}
														</span>
														<strong>
															{service.template}
														</strong>
													</div>
													<span className='monitoring-service-port'>
														{service.port
															? `Port ${service.port}`
															: 'No port'}
													</span>
												</div>

												<div className='monitoring-service-badges'>
													<span
														className={`monitoring-runtime-pill status-${
															service.running
																? 'running'
																: 'stopped'
														}`}
													>
														{service.running
															? 'Live'
															: 'Stopped'}
													</span>
													<span
														className={`monitoring-health-pill tone-${healthTone}`}
													>
														<MonitorHeartRounded fontSize='inherit' />
														{getMonitoringStatusLabel(
															service.monitoring
																?.healthStatus,
														)}
													</span>
												</div>

												<div className='monitoring-service-metrics'>
													<div className='monitoring-service-metric'>
														<span>Uptime</span>
														<strong>
															{formatDuration(
																service
																	.monitoring
																	?.uptimeMs,
															)}
														</strong>
													</div>
													<div className='monitoring-service-metric'>
														<span>Response</span>
														<strong>
															{formatLatency(
																service
																	.monitoring
																	?.responseTimeMs,
															)}
														</strong>
													</div>
													<div className='monitoring-service-metric'>
														<span>Restarts</span>
														<strong>
															{service.monitoring
																?.restartCount ||
																0}
														</strong>
													</div>
													<div className='monitoring-service-metric'>
														<span>
															Failed checks
														</span>
														<strong>
															{service.monitoring
																?.failedRequestCount ||
																0}
														</strong>
													</div>
												</div>

												{service.monitoring
													?.healthStatus ===
													'degraded' &&
													service.monitoring
														?.lastError && (
														<p className='monitoring-service-error'>
															{
																service
																	.monitoring
																	.lastError
															}
														</p>
													)}

												<div className='monitoring-service-actions'>
													{service.url ? (
														<a
															href={service.url}
															target='_blank'
															rel='noopener noreferrer'
															className='monitoring-quiet-link'
														>
															Open{' '}
															{service.label.toLowerCase()}
														</a>
													) : (
														<span className='monitoring-muted-note'>
															Available from the
															project workspace
														</span>
													)}
												</div>
											</div>
										);
									})}
								</div>
							</article>
						);
					})}
				</section>
			)}
		</div>
	);
}

export default Monitoring;
