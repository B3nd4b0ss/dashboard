import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import EventRounded from '@mui/icons-material/EventRounded';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import TerminalRounded from '@mui/icons-material/TerminalRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import HubRounded from '@mui/icons-material/HubRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import MonitorHeartRounded from '@mui/icons-material/MonitorHeartRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import {
	getProjectCommandLabel,
	getProjectLaunchLabel,
	getProjectPrimaryEntry,
	getProjectRuntimeLabel,
	getProjectScaffold,
	getTemplateLabel,
	hasWebsiteMonitoring as hasWebsiteProjectMonitoring,
} from '../utils/projectPresentation';
import './ProjectDetail.css';

const API = 'http://localhost:4000';

function broadcastProjectAction(projectName, action) {
	window.dispatchEvent(
		new CustomEvent('dashboard:project-action', {
			detail: { projectName, action },
		}),
	);
}

function getConnectionInfo(database) {
	if (!database || !database.credentials) {
		return null;
	}

	const { user, password, database: databaseName, host, port } =
		database.credentials;

	switch (database.type) {
		case 'mysql':
			return {
				label: 'MySQL URL',
				masked: `mysql://${user}:********@${host}:${port}/${databaseName}`,
				full: `mysql://${user}:${password}@${host}:${port}/${databaseName}`,
			};
		case 'mongodb':
			return {
				label: 'MongoDB URL',
				masked: `mongodb://${host}:${port}/${databaseName}`,
				full: `mongodb://${host}:${port}/${databaseName}`,
			};
		default:
			return {
				label: 'PostgreSQL URL',
				masked: `postgresql://${user}:********@${host}:${port}/${databaseName}`,
				full: `postgresql://${user}:${password}@${host}:${port}/${databaseName}`,
			};
	}
}

function getStatusLabel(status) {
	switch (status) {
		case 'running':
			return 'Running';
		case 'partial':
			return 'Needs attention';
		default:
			return 'Stopped';
	}
}

function getTaskStatusLabel(status) {
	switch (status) {
		case 'in_progress':
			return 'In Progress';
		case 'review':
			return 'Review';
		case 'done':
			return 'Done';
		default:
			return 'Backlog';
	}
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

function buildEditableProject(project = {}) {
	const scaffold = getProjectScaffold(project);

	return {
		name: project.name || '',
		projectLocation: project.projectLocation || '',
		frontendPort: project.frontendPort || '',
		backendPort: project.backendPort || '',
		description: scaffold.description || '',
		version: scaffold.version || '',
		javaPackageName: scaffold.javaPackageName || '',
		javaMainClass: scaffold.javaMainClass || '',
		javaVersion: scaffold.javaVersion || '',
		javaGroupId: scaffold.javaGroupId || '',
		javaArtifactId: scaffold.javaArtifactId || '',
	};
}

function ProjectDetail() {
	const { name } = useParams();
	const navigate = useNavigate();
	const [project, setProject] = useState(null);
	const [projectTasks, setProjectTasks] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [editMode, setEditMode] = useState(false);
	const [edited, setEdited] = useState({});
	const [showConnectionModal, setShowConnectionModal] = useState(false);
	const [showLogModal, setShowLogModal] = useState(false);
	const [copied, setCopied] = useState(false);
	const [busyAction, setBusyAction] = useState('');
	const [projectLogs, setProjectLogs] = useState({
		services: { frontend: null, backend: null },
	});
	const [logsLoading, setLogsLoading] = useState(false);
	const [logsError, setLogsError] = useState('');
	const [selectedLogService, setSelectedLogService] = useState('');
	const [folderPickerBusy, setFolderPickerBusy] = useState(false);

	const getDefaultLogService = (nextProject = project) => {
		if (nextProject?.frontend) {
			return 'frontend';
		}

		if (nextProject?.backend) {
			return 'backend';
		}

		return '';
	};

	const fetchProject = async () => {
		try {
			const [projectResponse, tasksResponse] = await Promise.all([
				axios.get(`${API}/projects/${encodeURIComponent(name)}`),
				axios.get(`${API}/tasks`, {
					params: { projectName: name },
				}),
			]);
			setProject(projectResponse.data);
			setEdited(buildEditableProject(projectResponse.data));
			setProjectTasks(tasksResponse.data);
			setError('');
		} catch (err) {
			setError('Project not found.');
		} finally {
			setLoading(false);
		}
	};

	const fetchProjectSnapshot = async ({ onData } = {}) => {
		try {
			const response = await axios.get(
				`${API}/projects/${encodeURIComponent(name)}`,
			);
			if (typeof onData === 'function') {
				onData(response.data);
				return;
			}
			setProject(response.data);
			if (!editMode) {
				setEdited(buildEditableProject(response.data));
			}
		} catch (err) {
			// Keep the last rendered project visible during transient polling failures.
		}
	};

	const fetchLogs = async ({ preferredService = null, silent = false } = {}) => {
		const fallbackService = preferredService || getDefaultLogService();
		if (!fallbackService) {
			return;
		}

		if (!silent) {
			setLogsLoading(true);
		}

		try {
			const response = await axios.get(
				`${API}/projects/${encodeURIComponent(name)}/logs`,
				{
					params: { limit: 260 },
				},
			);

			setProjectLogs(response.data);
			setLogsError('');

			if (!selectedLogService) {
				setSelectedLogService(fallbackService);
			}
		} catch (err) {
			if (!silent) {
				setLogsError(
					err.response?.data?.error || 'Failed to load runtime logs.',
				);
			}
		} finally {
			if (!silent) {
				setLogsLoading(false);
			}
		}
	};

	useEffect(() => {
		setLoading(true);
		setShowLogModal(false);
		setProjectLogs({ services: { frontend: null, backend: null } });
		setLogsError('');
		setSelectedLogService('');
		fetchProject();
	}, [name]);

	useEffect(() => {
		let active = true;

		const refreshSnapshot = async () => {
			if (!active) {
				return;
			}

			await fetchProjectSnapshot({
				onData: (nextProject) => {
					if (!active) {
						return;
					}

					setProject(nextProject);
					if (!editMode) {
						setEdited(buildEditableProject(nextProject));
					}
				},
			});
		};

		const intervalId = window.setInterval(() => {
			refreshSnapshot();
		}, 6000);

		return () => {
			active = false;
			window.clearInterval(intervalId);
		};
	}, [name, editMode]);

	useEffect(() => {
		if (!showLogModal) {
			return undefined;
		}

		let active = true;

		const refreshLogs = async (silent = false) => {
			if (!active) {
				return;
			}

			await fetchLogs({ silent });
		};

		refreshLogs();
		const intervalId = window.setInterval(() => {
			refreshLogs(true);
		}, 4000);

		return () => {
			active = false;
			window.clearInterval(intervalId);
		};
	}, [showLogModal, name, project?.frontend, project?.backend]);

	const handleChange = (field, value) => {
		setEdited((previous) => ({ ...previous, [field]: value }));
	};

	const browseProjectLocation = async () => {
		setFolderPickerBusy(true);

		try {
			const response = await axios.post(`${API}/system/pick-folder`, {
				initialPath: edited.projectLocation || project?.projectLocation || '',
				title: 'Choose the new parent folder for this project',
			});

			if (!response.data?.canceled && response.data?.path) {
				handleChange('projectLocation', response.data.path);
			}
		} catch (error) {
			alert(error.response?.data?.error || 'Failed to open folder picker.');
		} finally {
			setFolderPickerBusy(false);
		}
	};

	const runAction = async (action, request) => {
		setBusyAction(action);
		broadcastProjectAction(project.name, action);

		try {
			await request();
			await fetchProject();
		} catch (err) {
			alert(err.response?.data?.error || err.message);
		} finally {
			setBusyAction('');
		}
	};

	const saveChanges = async () => {
		const canEditFrontendPort = Boolean(services.frontend);
		const canEditBackendPort = Boolean(services.backend);
		const projectScaffold = getProjectScaffold(project);
		const isJavaProject = ['java', 'java-console', 'java-maven'].includes(
			project.backend,
		);
		const isMavenProject = project.backend === 'java-maven';
		const nextName = String(edited.name || '').trim();

		if (!nextName) {
			alert('Project name is required.');
			return;
		}

		if (
			canEditFrontendPort &&
			canEditBackendPort &&
			String(edited.frontendPort) === String(edited.backendPort)
		) {
			alert('Frontend and backend ports must be different.');
			return;
		}

		try {
			const updates = {};

			if (nextName !== project.name) {
				updates.name = nextName;
			}

			if (
				canEditFrontendPort &&
				String(edited.frontendPort) !== String(project.frontendPort)
			) {
				updates.frontendPort = edited.frontendPort;
			}

			if (
				canEditBackendPort &&
				String(edited.backendPort) !== String(project.backendPort)
			) {
				updates.backendPort = edited.backendPort;
			}

			if (edited.description !== projectScaffold.description) {
				updates.description = edited.description;
			}

			if (
				String(edited.projectLocation || '').trim() !==
				String(project.projectLocation || '').trim()
			) {
				updates.projectLocation = edited.projectLocation;
			}

			if (edited.version !== projectScaffold.version) {
				updates.version = edited.version;
			}

			if (isJavaProject) {
				if (edited.javaPackageName !== projectScaffold.javaPackageName) {
					updates.javaPackageName = edited.javaPackageName;
				}

				if (edited.javaMainClass !== projectScaffold.javaMainClass) {
					updates.javaMainClass = edited.javaMainClass;
				}

				if (edited.javaVersion !== projectScaffold.javaVersion) {
					updates.javaVersion = edited.javaVersion;
				}
			}

			if (isMavenProject) {
				if (edited.javaGroupId !== projectScaffold.javaGroupId) {
					updates.javaGroupId = edited.javaGroupId;
				}

				if (edited.javaArtifactId !== projectScaffold.javaArtifactId) {
					updates.javaArtifactId = edited.javaArtifactId;
				}
			}

			if (Object.keys(updates).length === 0) {
				setEditMode(false);
				return;
			}

			await axios.patch(
				`${API}/projects/${encodeURIComponent(project.name)}`,
				updates,
			);

			if (updates.name && updates.name !== project.name) {
				navigate(`/projects/${encodeURIComponent(updates.name)}`);
				return;
			}

			await fetchProject();
			setEditMode(false);
		} catch (err) {
			alert(err.response?.data?.error || 'Update failed.');
		}
	};

	const copyToClipboard = async () => {
		const connection = getConnectionInfo(project?.database);
		if (!connection) {
			return;
		}

		try {
			await navigator.clipboard.writeText(connection.full);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1800);
		} catch (err) {
			alert('Failed to copy to clipboard.');
		}
	};

	const copyLogsToClipboard = async (content) => {
		try {
			await navigator.clipboard.writeText(content);
		} catch (err) {
			alert('Failed to copy logs to clipboard.');
		}
	};

	const openLogs = async (preferredService = null) => {
		const nextService =
			preferredService || selectedLogService || getDefaultLogService();

		if (!nextService) {
			return;
		}

		setSelectedLogService(nextService);
		setShowLogModal(true);
		await fetchLogs({ preferredService: nextService });
	};

	if (loading) {
		return <div className='project-detail-state'>Loading project...</div>;
	}

	if (error || !project) {
		return <div className='project-detail-state error'>{error}</div>;
	}

	const connectionInfo = getConnectionInfo(project.database);
	const runtime = project.runtime || {};
	const services = runtime.services || {};
	const monitoring = project.monitoring || { services: {} };
	const monitoringServices = monitoring.services || {};
	const taskSummary = project.taskSummary || {};
	const isRunning = project.status === 'running';
	const isPartial = project.status === 'partial';
	const hasManagedServices =
		project.hasManagedServices || (runtime.expectedServiceCount || 0) > 0;
	const showMonitoring = hasWebsiteProjectMonitoring(project);
	const scaffold = getProjectScaffold(project);
	const launchLabel = getProjectLaunchLabel(project);
	const primaryEntry = getProjectPrimaryEntry(project);
	const primaryCommand = getProjectCommandLabel(project);
	const runtimeLabel = getProjectRuntimeLabel(project);
	const isJavaProject = ['java', 'java-console', 'java-maven'].includes(
		project.backend,
	);
	const isMavenProject = project.backend === 'java-maven';
	const summaryTiles = showMonitoring
		? [
				{ label: 'Launch mode', value: launchLabel },
				{ label: 'Version', value: scaffold.version },
				{
					label: 'Project health',
					value: getMonitoringStatusLabel(monitoring.status),
				},
				{
					label: 'Services live',
					value: `${runtime.activeServiceCount || 0}/${runtime.expectedServiceCount || 0}`,
				},
				{
					label: 'Avg response',
					value:
						project.status === 'stopped'
							? 'Offline'
							: formatLatency(monitoring.averageResponseTimeMs),
				},
				{
					label: 'Workspace size',
					value: formatBytes(monitoring.workspaceSizeBytes),
				},
			]
		: [
				{ label: 'Launch mode', value: launchLabel },
				{ label: 'Version', value: scaffold.version },
				{ label: 'Primary entry', value: primaryEntry },
				{ label: 'Run command', value: primaryCommand },
				{ label: 'Runtime', value: runtimeLabel },
				{
					label: 'Workspace size',
					value: formatBytes(monitoring.workspaceSizeBytes),
				},
			];
	const logServiceOptions = [
		services.frontend
			? {
					key: 'frontend',
					label: 'Frontend',
					Icon: PublicRounded,
					running: services.frontend?.running,
				}
			: null,
		services.backend
			? {
					key: 'backend',
					label: 'Backend',
					Icon: HubRounded,
					running: services.backend?.running,
				}
			: null,
	].filter(Boolean);
	const selectedLog =
		(selectedLogService && projectLogs.services?.[selectedLogService]) || null;
	const canOpenLogs = logServiceOptions.length > 0;

	return (
		<div className='project-detail-page'>
			{showConnectionModal && connectionInfo && (
				<div
					className='modal-overlay'
					onClick={() => setShowConnectionModal(false)}>
					<div
						className='modal-content'
						onClick={(event) => event.stopPropagation()}>
						<div className='modal-header'>
							<div>
								<span className='modal-label'>Connection String</span>
								<h3>{project.database.name}</h3>
							</div>
							<button
								type='button'
								className='modal-close'
								onClick={() => setShowConnectionModal(false)}>
								X
							</button>
						</div>
						<div className='modal-body'>
							<div className='connection-block'>
								<span>{connectionInfo.label}</span>
								<code>{connectionInfo.masked}</code>
							</div>
							<div className='connection-block'>
								<span>Full value</span>
								<code>{connectionInfo.full}</code>
							</div>
							<div className='connection-actions'>
								<button type='button' onClick={copyToClipboard}>
									{copied ? 'Copied' : 'Copy full string'}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
			{showLogModal && (
				<div className='modal-overlay' onClick={() => setShowLogModal(false)}>
					<div
						className='modal-content log-modal-content'
						onClick={(event) => event.stopPropagation()}>
						<div className='modal-header log-modal-header'>
							<div>
								<span className='modal-label'>Runtime Logs</span>
								<h3>{project.name}</h3>
							</div>
							<div className='log-modal-actions'>
								<button
									type='button'
									className='ghost-button'
									onClick={() =>
										fetchLogs({
											preferredService: selectedLogService,
										})
									}>
									<RefreshRounded fontSize='small' />
									Refresh
								</button>
								<button
									type='button'
									className='modal-close'
									onClick={() => setShowLogModal(false)}>
									X
								</button>
							</div>
						</div>
						<div className='modal-body log-modal-body'>
							<div className='log-service-tabs'>
								{logServiceOptions.map((option) => {
									const TabIcon = option.Icon;
									return (
										<button
											key={option.key}
											type='button'
											className={`log-service-tab ${
												selectedLogService === option.key
													? 'active'
													: ''
											}`}
											onClick={() =>
												setSelectedLogService(option.key)
											}>
											<TabIcon fontSize='small' />
											<span>{option.label}</span>
											<strong>
												{option.running ? 'Live' : 'Stored'}
											</strong>
										</button>
									);
								})}
							</div>

							<div className='log-viewer-shell'>
								<div className='log-viewer-toolbar'>
									<div className='log-meta-stack'>
										<span className='log-meta-label'>
											{selectedLogService || 'service'} log
										</span>
										{selectedLog?.updatedAt ? (
											<strong>
												Last update{' '}
												{new Date(
													selectedLog.updatedAt,
												).toLocaleString()}
											</strong>
										) : (
											<strong>No captured output yet</strong>
										)}
										{selectedLog?.truncated && (
											<span className='log-meta-note'>
												Showing the newest tail of the log file.
											</span>
										)}
									</div>

									{selectedLog?.content && (
										<button
											type='button'
											className='ghost-button'
											onClick={() =>
												copyLogsToClipboard(
													selectedLog.content,
												)
											}>
											Copy logs
										</button>
									)}
								</div>

								{logsLoading ? (
									<div className='log-viewer-empty'>
										Loading runtime logs...
									</div>
								) : logsError ? (
									<div className='log-viewer-empty error'>
										{logsError}
									</div>
								) : selectedLog?.content ? (
									<pre className='log-console-output'>
										{selectedLog.content}
									</pre>
								) : (
									<div className='log-viewer-empty'>
										No log lines have been captured for this
										service yet. Start the project and any new
										stdout, stderr, or crash markers will appear
										here automatically.
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			)}

			<Link to='/projects' className='detail-back-link'>
				Back to projects
			</Link>

			<section className='detail-hero'>
				<div className='detail-hero-copy'>
					<div className='hero-badges'>
						<span className={`status-pill ${project.status}`}>
							{getStatusLabel(project.status)}
						</span>
						<span className='meta-pill'>{launchLabel}</span>
						{project.frontend && (
							<span className='meta-pill'>
								{getTemplateLabel(project.frontend)}
							</span>
						)}
						{project.backend && (
							<span className='meta-pill'>
								{getTemplateLabel(project.backend)}
							</span>
						)}
						{project.database && (
							<span className='meta-pill'>{project.database.type}</span>
						)}
					</div>
					<h2>{project.name}</h2>
					<p className='detail-hero-description'>{scaffold.description}</p>
					<p className='detail-hero-path'>{project.projectPath}</p>
				</div>
				<div className='detail-hero-actions'>
					{hasManagedServices ? (
						isRunning ? (
							<button
								type='button'
								className='danger-button'
								disabled={busyAction === 'stop'}
								onClick={() =>
									runAction('stop', () =>
										axios.post(
											`${API}/projects/${encodeURIComponent(
												project.name,
											)}/stop`,
										),
									)
								}>
								{busyAction === 'stop'
									? 'Stopping...'
									: 'Stop project'}
							</button>
						) : (
							<button
								type='button'
								className='success-button'
								disabled={busyAction === 'start'}
								onClick={() =>
									runAction('start', () =>
										axios.post(
											`${API}/projects/${encodeURIComponent(
												project.name,
											)}/start`,
										),
									)
								}>
								{busyAction === 'start'
									? 'Starting...'
									: isPartial
										? 'Resume project'
										: 'Start project'}
							</button>
						)
					) : (
						<Link
							to={`/projects/${encodeURIComponent(project.name)}/editor`}
							className='success-button'>
							Run in editor
						</Link>
					)}

					{project.frontendUrl && (
						<a
							href={project.frontendUrl}
							target='_blank'
							rel='noopener noreferrer'
							className='ghost-link'>
							Open frontend
						</a>
					)}

					{project.backendUrl && (
						<a
							href={project.backendUrl}
							target='_blank'
							rel='noopener noreferrer'
							className='ghost-link'>
							Open backend
						</a>
					)}

					<button
						type='button'
						className='ghost-button'
						onClick={() =>
							window.open(`vscode://file/${project.projectPath}`)
						}>
						Open code
					</button>

					<Link
						to={`/projects/${encodeURIComponent(project.name)}/editor`}
						className='ghost-link'>
						Open editor
					</Link>

					{canOpenLogs && (
						<button
							type='button'
							className='ghost-button'
							onClick={() => openLogs()}>
							<TerminalRounded fontSize='small' />
							Runtime logs
						</button>
					)}
				</div>
			</section>

			<section className='detail-summary'>
				{summaryTiles.map((tile) => (
					<div key={tile.label} className='summary-tile'>
						<span>{tile.label}</span>
						<strong>{tile.value}</strong>
					</div>
				))}
			</section>

			<section className='detail-grid'>
				<article className='detail-card detail-card-wide'>
					<div className='card-heading'>
						<span className='card-label'>Runtime</span>
						<h3>
							{showMonitoring
								? 'Services and workspace'
								: 'Workspace and launch flow'}
						</h3>
					</div>
					<div className='service-grid'>
						{services.frontend && (
							<div className='service-card'>
								<span className='service-kind'>Frontend</span>
								<strong>{getTemplateLabel(project.frontend)}</strong>
								<p>Port {project.frontendPort}</p>
								<div className='service-status-row'>
									<span
										className={`service-state ${
											services.frontend?.running
												? 'running'
												: 'stopped'
										}`}>
										{services.frontend?.running ? 'Live' : 'Stopped'}
									</span>
									<span
										className={`health-state ${
											monitoringServices.frontend
												?.healthStatus || 'offline'
										}`}>
										<MonitorHeartRounded fontSize='inherit' />
										{getMonitoringStatusLabel(
											monitoringServices.frontend
												?.healthStatus,
										)}
									</span>
								</div>
								<div className='service-metric-list'>
									<div className='service-metric-item'>
										<span>
											<ScheduleRounded fontSize='inherit' />
											Uptime
										</span>
										<strong>
											{formatDuration(
												monitoringServices.frontend
													?.uptimeMs,
											)}
										</strong>
									</div>
									<div className='service-metric-item'>
										<span>
											<MonitorHeartRounded fontSize='inherit' />
											Response
										</span>
										<strong>
											{formatLatency(
												monitoringServices.frontend
													?.responseTimeMs,
											)}
										</strong>
									</div>
									<div className='service-metric-item'>
										<span>
											<RestartAltRounded fontSize='inherit' />
											Restarts
										</span>
										<strong>
											{monitoringServices.frontend
												?.restartCount || 0}
										</strong>
									</div>
									<div className='service-metric-item'>
										<span>
											<WarningAmberRounded fontSize='inherit' />
											Failed checks
										</span>
										<strong>
											{monitoringServices.frontend
												?.failedRequestCount || 0}
										</strong>
									</div>
								</div>
								{monitoringServices.frontend?.healthStatus ===
									'degraded' &&
									monitoringServices.frontend?.lastError && (
										<p className='service-health-error'>
											{monitoringServices.frontend.lastError}
										</p>
									)}
								<div className='service-card-actions'>
									<button
										type='button'
										className='ghost-button'
										onClick={() => openLogs('frontend')}>
										<TerminalRounded fontSize='small' />
										View logs
									</button>
								</div>
							</div>
						)}

						{services.backend && (
							<div className='service-card'>
								<span className='service-kind'>Backend</span>
								<strong>{getTemplateLabel(project.backend)}</strong>
								<p>Port {project.backendPort}</p>
								<div className='service-status-row'>
									<span
										className={`service-state ${
											services.backend?.running
												? 'running'
												: 'stopped'
										}`}>
										{services.backend?.running ? 'Live' : 'Stopped'}
									</span>
									{showMonitoring ? (
										<span
											className={`health-state ${
												monitoringServices.backend
													?.healthStatus || 'offline'
											}`}>
											<MonitorHeartRounded fontSize='inherit' />
											{getMonitoringStatusLabel(
												monitoringServices.backend
													?.healthStatus,
											)}
										</span>
									) : (
										<span className='service-state neutral'>
											{runtimeLabel}
										</span>
									)}
								</div>
								<div className='service-metric-list'>
									{showMonitoring ? (
										<>
											<div className='service-metric-item'>
												<span>
													<ScheduleRounded fontSize='inherit' />
													Uptime
												</span>
												<strong>
													{formatDuration(
														monitoringServices.backend
															?.uptimeMs,
													)}
												</strong>
											</div>
											<div className='service-metric-item'>
												<span>
													<MonitorHeartRounded fontSize='inherit' />
													Response
												</span>
												<strong>
													{formatLatency(
														monitoringServices.backend
															?.responseTimeMs,
													)}
												</strong>
											</div>
											<div className='service-metric-item'>
												<span>
													<RestartAltRounded fontSize='inherit' />
													Restarts
												</span>
												<strong>
													{monitoringServices.backend
														?.restartCount || 0}
												</strong>
											</div>
											<div className='service-metric-item'>
												<span>
													<WarningAmberRounded fontSize='inherit' />
													Failed checks
												</span>
												<strong>
													{monitoringServices.backend
														?.failedRequestCount || 0}
												</strong>
											</div>
										</>
									) : (
										<>
											<div className='service-metric-item'>
												<span>Primary entry</span>
												<strong>{primaryEntry}</strong>
											</div>
											<div className='service-metric-item'>
												<span>Default command</span>
												<strong>{primaryCommand}</strong>
											</div>
											<div className='service-metric-item'>
												<span>Runtime</span>
												<strong>{runtimeLabel}</strong>
											</div>
											<div className='service-metric-item'>
												<span>Version</span>
												<strong>{scaffold.version}</strong>
											</div>
										</>
									)}
								</div>
								{showMonitoring &&
									monitoringServices.backend?.healthStatus ===
									'degraded' &&
									monitoringServices.backend?.lastError && (
										<p className='service-health-error'>
											{monitoringServices.backend.lastError}
										</p>
									)}
								<div className='service-card-actions'>
									<button
										type='button'
										className='ghost-button'
										onClick={() => openLogs('backend')}>
										<TerminalRounded fontSize='small' />
										View logs
									</button>
								</div>
							</div>
						)}

						{project.database && (
							<div className='service-card'>
								<span className='service-kind'>Database</span>
								<strong>{project.database.name}</strong>
								<p>{project.database.type}</p>
								<span className='service-state neutral'>
									Port {project.database.port}
								</span>
							</div>
						)}

						<div className='service-card'>
							<span className='service-kind'>Workspace</span>
							<strong>{launchLabel}</strong>
							<p>
								{showMonitoring
									? 'Dashboard-managed services cover the long-running parts while the editor stays ready for build, test, and setup commands.'
									: 'This project is designed to be launched from the editor when you need a build, run, or one-off executable.'}
							</p>
							<span className='service-state neutral'>
								{project.commandPresets?.length
									? `${project.commandPresets.length} quick actions`
									: 'Editor terminal ready'}
							</span>
							<div className='service-metric-list'>
								<div className='service-metric-item'>
									<span>
										<TerminalRounded fontSize='inherit' />
										Primary entry
									</span>
									<strong>{primaryEntry}</strong>
								</div>
								<div className='service-metric-item'>
									<span>Default command</span>
									<strong>{primaryCommand}</strong>
								</div>
								<div className='service-metric-item'>
									<span>Runtime</span>
									<strong>{runtimeLabel}</strong>
								</div>
								<div className='service-metric-item'>
									<span>Version</span>
									<strong>{scaffold.version}</strong>
								</div>
							</div>
							<div className='service-card-actions'>
								<Link
									to={`/projects/${encodeURIComponent(project.name)}/editor`}
									className='ghost-link'>
									<TerminalRounded fontSize='small' />
									Open editor terminal
								</Link>
							</div>
						</div>
					</div>
				</article>

				<article className='detail-card detail-card-wide'>
					<div className='card-heading'>
						<span className='card-label'>
							{showMonitoring ? 'Monitoring' : 'Workspace'}
						</span>
						<h3>
							{showMonitoring
								? 'Service health'
								: 'How this project runs'}
						</h3>
					</div>
					<div className='detail-info-list'>
						<div className='info-row'>
							<span>Launch mode</span>
							<strong>{launchLabel}</strong>
						</div>
						{showMonitoring ? (
							<>
								<div className='info-row'>
									<span>Project health</span>
									<strong>
										{getMonitoringStatusLabel(monitoring.status)}
									</strong>
								</div>
								<div className='info-row'>
									<span>Average response</span>
									<strong>
										{project.status === 'stopped'
											? 'Offline'
											: formatLatency(
													monitoring.averageResponseTimeMs,
												)}
									</strong>
								</div>
								<div className='info-row'>
									<span>Total restarts</span>
									<strong>{monitoring.restartCount || 0}</strong>
								</div>
								<div className='info-row'>
									<span>Crash count</span>
									<strong>{monitoring.crashCount || 0}</strong>
								</div>
								<div className='info-row'>
									<span>Workspace size</span>
									<strong>{formatBytes(monitoring.workspaceSizeBytes)}</strong>
								</div>
								<div className='info-row'>
									<span>Last health check</span>
									<strong>
										{monitoring.lastCheckedAt
											? new Date(
													monitoring.lastCheckedAt,
												).toLocaleString()
											: 'No checks yet'}
									</strong>
								</div>
							</>
						) : (
							<>
								<div className='info-row'>
									<span>Primary entry</span>
									<strong>{primaryEntry}</strong>
								</div>
								<div className='info-row'>
									<span>Default command</span>
									<strong>{primaryCommand}</strong>
								</div>
								<div className='info-row'>
									<span>Runtime</span>
									<strong>{runtimeLabel}</strong>
								</div>
								<div className='info-row'>
									<span>Workspace size</span>
									<strong>{formatBytes(monitoring.workspaceSizeBytes)}</strong>
								</div>
							</>
						)}
					</div>
				</article>

				<article className='detail-card detail-card-wide'>
					<div className='card-heading card-heading-spread'>
						<div>
							<span className='card-label'>Delivery</span>
							<h3>Tasks and progression</h3>
						</div>
						<Link
							to={`/tasks?project=${encodeURIComponent(project.name)}`}
							className='ghost-link'>
							<ArrowOutwardRounded fontSize='small' />
							Open task board
						</Link>
					</div>

					{taskSummary.total > 0 ? (
						<>
							<div className='detail-task-summary'>
								<div className='task-summary-chip'>
									<span>Progress</span>
									<strong>{taskSummary.progressPercentage || 0}%</strong>
								</div>
								<div className='task-summary-chip'>
									<span>Open</span>
									<strong>{taskSummary.pending || 0}</strong>
								</div>
								<div className='task-summary-chip'>
									<span>Review</span>
									<strong>{taskSummary.review || 0}</strong>
								</div>
								<div className='task-summary-chip'>
									<span>Overdue</span>
									<strong>{taskSummary.overdue || 0}</strong>
								</div>
							</div>

							<div className='detail-task-list'>
								{projectTasks.slice(0, 6).map((task) => (
									<div key={task.id} className='detail-task-item'>
										<div className='detail-task-copy'>
											<div className='task-chip-row'>
												<span
													className={`task-status-pill status-${task.status}`}>
													{getTaskStatusLabel(task.status)}
												</span>
												<span
													className={`task-priority-pill priority-${task.priority}`}>
													{task.priority}
												</span>
											</div>
											<strong>{task.title}</strong>
											{task.description && <p>{task.description}</p>}
										</div>

										<div className='detail-task-meta'>
											<div className='detail-task-meta-item'>
												<GroupsRounded fontSize='inherit' />
												<span>{task.assignee?.name || 'Unassigned'}</span>
											</div>
											<div className='detail-task-meta-item'>
												<TaskAltRounded fontSize='inherit' />
												<span>{getTaskStatusLabel(task.status)}</span>
											</div>
											<div
												className={`detail-task-meta-item ${
													task.overdue ? 'overdue' : ''
												}`}>
												<EventRounded fontSize='inherit' />
												<span>{task.dueDate || 'No due date'}</span>
											</div>
										</div>
									</div>
								))}
							</div>
						</>
					) : (
						<p className='detail-copy'>
							No tasks are linked to this project yet. Create tasks from the
							task board to start tracking actual delivery progress.
						</p>
					)}
				</article>

				<article className='detail-card'>
					<div className='card-heading'>
						<span className='card-label'>Overview</span>
						<h3>Project overview</h3>
					</div>
					<div className='detail-info-list'>
						<div className='info-row'>
							<span>Name</span>
							<strong>{project.name}</strong>
						</div>
						<div className='info-row'>
							<span>Description</span>
							<strong>{scaffold.description}</strong>
						</div>
						<div className='info-row'>
							<span>Project folder</span>
							<strong>{project.projectPath}</strong>
						</div>
						<div className='info-row'>
							<span>Frontend</span>
							<strong>{getTemplateLabel(project.frontend)}</strong>
						</div>
						<div className='info-row'>
							<span>Backend</span>
							<strong>{getTemplateLabel(project.backend)}</strong>
						</div>
						<div className='info-row'>
							<span>Launch mode</span>
							<strong>{launchLabel}</strong>
						</div>
						<div className='info-row'>
							<span>Version</span>
							<strong>{scaffold.version}</strong>
						</div>
						<div className='info-row'>
							<span>Database</span>
							<strong>{project.database?.type || 'None'}</strong>
						</div>
						<div className='info-row'>
							<span>Status</span>
							<strong>{getStatusLabel(project.status)}</strong>
						</div>
					</div>
				</article>

				{isJavaProject && (
					<article className='detail-card'>
						<div className='card-heading'>
							<span className='card-label'>Java</span>
							<h3>Compiler and package setup</h3>
						</div>
						<div className='detail-info-list'>
							<div className='info-row'>
								<span>Main class</span>
								<strong>{scaffold.javaMainClass}</strong>
							</div>
							<div className='info-row'>
								<span>Package</span>
								<strong>{scaffold.javaPackageName}</strong>
							</div>
							<div className='info-row'>
								<span>Qualified class</span>
								<strong>{scaffold.javaQualifiedMainClass}</strong>
							</div>
							<div className='info-row'>
								<span>Compiler release</span>
								<strong>Java {scaffold.javaVersion}</strong>
							</div>
							{isMavenProject && (
								<>
									<div className='info-row'>
										<span>Group ID</span>
										<strong>{scaffold.javaGroupId}</strong>
									</div>
									<div className='info-row'>
										<span>Artifact ID</span>
										<strong>{scaffold.javaArtifactId}</strong>
									</div>
								</>
							)}
						</div>
					</article>
				)}

				{project.database && project.database.credentials && (
					<article className='detail-card'>
						<div className='card-heading'>
							<span className='card-label'>Database</span>
							<h3>Credentials and access</h3>
						</div>
						<div className='detail-info-list'>
							<div className='info-row'>
								<span>Host</span>
								<strong>{project.database.credentials.host}</strong>
							</div>
							<div className='info-row'>
								<span>Port</span>
								<strong>{project.database.credentials.port}</strong>
							</div>
							{project.database.credentials.user && (
								<div className='info-row'>
									<span>User</span>
									<strong>{project.database.credentials.user}</strong>
								</div>
							)}
							{project.database.credentials.database && (
								<div className='info-row'>
									<span>Database</span>
									<strong>{project.database.credentials.database}</strong>
								</div>
							)}
							{project.database.clientPort && (
								<div className='info-row'>
									<span>Client</span>
									<a
										href={`http://localhost:${project.database.clientPort}`}
										target='_blank'
										rel='noopener noreferrer'>
										Open on port {project.database.clientPort}
									</a>
								</div>
							)}
						</div>
						<button
							type='button'
							className='ghost-button connection-button'
							onClick={() => setShowConnectionModal(true)}>
							Show connection string
						</button>
					</article>
				)}

				<article className='detail-card detail-edit-card'>
					<div className='card-heading card-heading-spread'>
						<div>
							<span className='card-label'>Edit</span>
							<h3>Project settings</h3>
						</div>

						{!editMode ? (
							<button
								type='button'
								className='ghost-button'
								onClick={() => setEditMode(true)}>
								Edit project
							</button>
						) : (
							<div className='edit-actions detail-edit-actions'>
								<button
									type='button'
									className='success-button'
									onClick={saveChanges}>
									Save changes
								</button>
								<button
									type='button'
									className='ghost-button'
									onClick={() => {
										setEdited(buildEditableProject(project));
										setEditMode(false);
									}}>
									Cancel
								</button>
							</div>
						)}
					</div>

					{editMode ? (
						<div className='edit-form'>
							<label className='field-group'>
								<span>Project name</span>
								<input
									value={edited.name || ''}
									onChange={(event) =>
										handleChange('name', event.target.value)
									}
								/>
							</label>
							<label className='field-group field-group-wide'>
								<div className='field-label-row'>
									<span>Project location</span>
									<button
										type='button'
										className='inline-field-action'
										onClick={browseProjectLocation}
										disabled={folderPickerBusy}>
										<FolderRounded fontSize='inherit' />
										{folderPickerBusy ? 'Opening...' : 'Browse'}
									</button>
								</div>
								<input
									value={edited.projectLocation || ''}
									onChange={(event) =>
										handleChange(
											'projectLocation',
											event.target.value,
										)
									}
									placeholder='Leave blank to use the default dashboard projects folder'
								/>
								<small className='field-help'>
									Edit this folder to move the project. The final
									project path will use the project name as the last
									segment.
								</small>
							</label>
							<label className='field-group'>
								<span>Version</span>
								<input
									value={edited.version || ''}
									onChange={(event) =>
										handleChange('version', event.target.value)
									}
									placeholder='0.1.0'
								/>
							</label>
							<label className='field-group field-group-wide'>
								<span>Description</span>
								<textarea
									value={edited.description || ''}
									onChange={(event) =>
										handleChange('description', event.target.value)
									}
									rows={4}
									placeholder='Describe what this project is for and what it does.'
								/>
							</label>
							{services.frontend && (
								<label className='field-group'>
									<span>Frontend port</span>
									<input
										type='number'
										value={edited.frontendPort || ''}
										onChange={(event) =>
											handleChange(
												'frontendPort',
												event.target.value,
											)
										}
									/>
								</label>
							)}
							{services.backend && (
								<label className='field-group'>
									<span>Backend port</span>
									<input
										type='number'
										value={edited.backendPort || ''}
										onChange={(event) =>
											handleChange(
												'backendPort',
												event.target.value,
											)
										}
									/>
								</label>
							)}
							{isJavaProject && (
								<>
									<label className='field-group'>
										<span>Java package</span>
										<input
											value={edited.javaPackageName || ''}
											onChange={(event) =>
												handleChange(
													'javaPackageName',
													event.target.value,
												)
											}
											placeholder='com.dashboard.app'
										/>
									</label>
									<label className='field-group'>
										<span>Main class</span>
										<input
											value={edited.javaMainClass || ''}
											onChange={(event) =>
												handleChange(
													'javaMainClass',
													event.target.value,
												)
											}
											placeholder='App'
										/>
									</label>
									<label className='field-group'>
										<span>Compiler release</span>
										<input
											value={edited.javaVersion || ''}
											onChange={(event) =>
												handleChange(
													'javaVersion',
													event.target.value,
												)
											}
											placeholder='11'
										/>
									</label>
								</>
							)}
							{isMavenProject && (
								<>
									<label className='field-group'>
										<span>Group ID</span>
										<input
											value={edited.javaGroupId || ''}
											onChange={(event) =>
												handleChange(
													'javaGroupId',
													event.target.value,
												)
											}
											placeholder='com.dashboard'
										/>
									</label>
									<label className='field-group'>
										<span>Artifact ID</span>
										<input
											value={edited.javaArtifactId || ''}
											onChange={(event) =>
												handleChange(
													'javaArtifactId',
													event.target.value,
												)
											}
											placeholder='workspace-app'
										/>
									</label>
								</>
							)}
						</div>
					) : (
						<p className='detail-copy'>
							Enter edit mode when you need to rename the workspace, update
							its folder, description, or version, or adjust Java and Maven
							scaffold settings so the generated files stay aligned with the
							project.
						</p>
					)}
				</article>
			</section>
		</div>
	);
}

export default ProjectDetail;
