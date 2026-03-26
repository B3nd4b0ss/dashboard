import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import EventRounded from '@mui/icons-material/EventRounded';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
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
	const [copied, setCopied] = useState(false);
	const [busyAction, setBusyAction] = useState('');

	const fetchProject = async () => {
		try {
			const [projectResponse, tasksResponse] = await Promise.all([
				axios.get(`${API}/projects/${encodeURIComponent(name)}`),
				axios.get(`${API}/tasks`, {
					params: { projectName: name },
				}),
			]);
			setProject(projectResponse.data);
			setEdited(projectResponse.data);
			setProjectTasks(tasksResponse.data);
			setError('');
		} catch (err) {
			setError('Project not found.');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		setLoading(true);
		fetchProject();
	}, [name]);

	const handleChange = (field, value) => {
		setEdited((previous) => ({ ...previous, [field]: value }));
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
		if (
			project.frontend &&
			project.backend &&
			String(edited.frontendPort) === String(edited.backendPort)
		) {
			alert('Frontend and backend ports must be different.');
			return;
		}

		try {
			const updates = {};

			if (edited.name !== project.name) {
				updates.name = edited.name;
			}

			if (String(edited.frontendPort) !== String(project.frontendPort)) {
				updates.frontendPort = edited.frontendPort;
			}

			if (String(edited.backendPort) !== String(project.backendPort)) {
				updates.backendPort = edited.backendPort;
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

	if (loading) {
		return <div className='project-detail-state'>Loading project...</div>;
	}

	if (error || !project) {
		return <div className='project-detail-state error'>{error}</div>;
	}

	const connectionInfo = getConnectionInfo(project.database);
	const runtime = project.runtime || {};
	const services = runtime.services || {};
	const taskSummary = project.taskSummary || {};
	const isRunning = project.status === 'running';
	const isPartial = project.status === 'partial';

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

			<Link to='/projects' className='detail-back-link'>
				Back to projects
			</Link>

			<section className='detail-hero'>
				<div className='detail-hero-copy'>
					<div className='hero-badges'>
						<span className={`status-pill ${project.status}`}>
							{getStatusLabel(project.status)}
						</span>
						{project.database && (
							<span className='meta-pill'>{project.database.type}</span>
						)}
					</div>
					<h2>{project.name}</h2>
					<p>{project.projectPath}</p>
				</div>
				<div className='detail-hero-actions'>
					{isRunning ? (
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
							{busyAction === 'stop' ? 'Stopping...' : 'Stop project'}
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
				</div>
			</section>

			<section className='detail-summary'>
				<div className='summary-tile'>
					<span>Running services</span>
					<strong>
						{runtime.activeServiceCount || 0}/{runtime.expectedServiceCount || 0}
					</strong>
				</div>
				<div className='summary-tile'>
					<span>Total tasks</span>
					<strong>{taskSummary.total || 0}</strong>
				</div>
				<div className='summary-tile'>
					<span>Tasks complete</span>
					<strong>{taskSummary.completed || 0}</strong>
				</div>
				<div className='summary-tile'>
					<span>Web app port</span>
					<strong>{project.frontendPort || 'Not configured'}</strong>
				</div>
				<div className='summary-tile'>
					<span>API port</span>
					<strong>{project.backendPort || 'Not configured'}</strong>
				</div>
				<div className='summary-tile'>
					<span>Linked database</span>
					<strong>{project.database?.name || 'None'}</strong>
				</div>
			</section>

			<section className='detail-grid'>
				<article className='detail-card'>
					<div className='card-heading'>
						<span className='card-label'>Runtime</span>
						<h3>Services and health</h3>
					</div>
					<div className='service-grid'>
						{project.frontend && (
							<div className='service-card'>
								<span className='service-kind'>Frontend</span>
								<strong>{project.frontend}</strong>
								<p>Port {project.frontendPort}</p>
								<span
									className={`service-state ${
										services.frontend?.running ? 'running' : 'stopped'
									}`}>
									{services.frontend?.running ? 'Live' : 'Stopped'}
								</span>
							</div>
						)}

						{project.backend && (
							<div className='service-card'>
								<span className='service-kind'>Backend</span>
								<strong>{project.backend}</strong>
								<p>Port {project.backendPort}</p>
								<span
									className={`service-state ${
										services.backend?.running ? 'running' : 'stopped'
									}`}>
									{services.backend?.running ? 'Live' : 'Stopped'}
								</span>
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
						<span className='card-label'>Metadata</span>
						<h3>Project overview</h3>
					</div>
					<div className='detail-info-list'>
						<div className='info-row'>
							<span>Name</span>
							<strong>{project.name}</strong>
						</div>
						<div className='info-row'>
							<span>Frontend</span>
							<strong>{project.frontend || 'None'}</strong>
						</div>
						<div className='info-row'>
							<span>Backend</span>
							<strong>{project.backend || 'None'}</strong>
						</div>
						<div className='info-row'>
							<span>Database type</span>
							<strong>{project.database?.type || 'None'}</strong>
						</div>
						<div className='info-row'>
							<span>Status</span>
							<strong>{getStatusLabel(project.status)}</strong>
						</div>
					</div>
				</article>

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
							<h3>Rename and reassign ports</h3>
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
										setEdited(project);
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
							{project.frontend && (
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
							{project.backend && (
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
						</div>
					) : (
						<p className='detail-copy'>
							Enter edit mode when you need to rename this workspace or move
							its frontend and backend to new ports.
						</p>
					)}
				</article>
			</section>
		</div>
	);
}

export default ProjectDetail;
