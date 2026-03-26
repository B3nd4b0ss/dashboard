import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AddRounded from '@mui/icons-material/AddRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import StorageRounded from '@mui/icons-material/StorageRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import StopRounded from '@mui/icons-material/StopRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import HubRounded from '@mui/icons-material/HubRounded';
import DnsRounded from '@mui/icons-material/DnsRounded';
import LanRounded from '@mui/icons-material/LanRounded';
import ConstructionRounded from '@mui/icons-material/ConstructionRounded';
import TerminalRounded from '@mui/icons-material/TerminalRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import AssignmentTurnedInRounded from '@mui/icons-material/AssignmentTurnedInRounded';
import SurfaceSelect from './SurfaceSelect';
import './Overview.css';

const API = 'http://localhost:4000';
const REFRESH_INTERVAL_MS = 7000;
const EMPTY_FORM = {
	name: '',
	frontend: '',
	backend: '',
	databaseId: '',
	frontendPort: '',
	backendPort: '',
};

const STATUS_FILTER_OPTIONS = [
	{
		value: 'all',
		label: 'All statuses',
		description: 'Show every project on the board.',
	},
	{
		value: 'running',
		label: 'Active',
		description: 'Only projects with live services.',
	},
	{
		value: 'partial',
		label: 'Attention',
		description: 'Projects with interrupted services.',
	},
	{
		value: 'stopped',
		label: 'Pending',
		description: 'Projects that are currently offline.',
	},
];

const FRONTEND_OPTIONS = [
	{
		value: '',
		label: 'No frontend',
		description: 'Skip the web app layer.',
	},
	{
		value: 'vite-react',
		label: 'Vite + React',
		description: 'Spin up a modern React frontend.',
	},
];

const BACKEND_OPTIONS = [
	{
		value: '',
		label: 'No backend',
		description: 'Frontend-only or database-only project.',
	},
	{
		value: 'node',
		label: 'Node + Express',
		description: 'Create an Express API service.',
	},
];

function getStatusLabel(status) {
	switch (status) {
		case 'running':
			return 'Active';
		case 'partial':
			return 'Attention';
		default:
			return 'Pending';
	}
}

function getProjectSummary(project) {
	return [
		project.frontend ? 'Frontend workspace' : 'No frontend',
		project.backend ? 'Backend service' : 'No backend',
		project.database ? `${project.database.type} linked` : 'No database',
		project.taskSummary?.total
			? `${project.taskSummary.total} tasks`
			: 'No tasks yet',
	]
		.filter(Boolean)
		.join(' | ');
}

function getProjectSearchText(project) {
	return [
		project.name,
		project.frontend,
		project.backend,
		project.database?.name,
		project.database?.type,
		project.status,
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
}

function getPrimaryProjectUrl(project) {
	return project.frontendUrl || project.backendUrl || null;
}

function getProjectProgress(project) {
	if (project.taskSummary?.total > 0) {
		return project.taskSummary.progressPercentage;
	}

	const expected = project.runtime?.expectedServiceCount || 0;
	const active = project.runtime?.activeServiceCount || 0;

	if (expected > 0) {
		return Math.max(18, Math.round((active / expected) * 100));
	}

	if (project.status === 'running') {
		return 92;
	}

	if (project.status === 'partial') {
		return 54;
	}

	return 24;
}

function getProjectCrew(project) {
	const crew = [];

	if (project.frontend) {
		crew.push({ label: 'UI', accent: 'blue' });
	}

	if (project.backend) {
		crew.push({ label: 'API', accent: 'green' });
	}

	if (project.database) {
		crew.push({ label: 'DB', accent: 'amber' });
	}

	if (crew.length === 0) {
		crew.push({ label: 'OPS', accent: 'slate' });
	}

	return crew;
}

function broadcastProjectAction(projectName, action) {
	window.dispatchEvent(
		new CustomEvent('dashboard:project-action', {
			detail: { projectName, action },
		}),
	);
}

function Overview() {
	const location = useLocation();
	const navigate = useNavigate();
	const [projects, setProjects] = useState([]);
	const [databases, setDatabases] = useState([]);
	const [query, setQuery] = useState('');
	const [statusFilter, setStatusFilter] = useState('all');
	const [form, setForm] = useState(EMPTY_FORM);
	const [showComposer, setShowComposer] = useState(true);
	const [showTerminal, setShowTerminal] = useState(false);
	const [terminalOutput, setTerminalOutput] = useState([]);
	const [isCreating, setIsCreating] = useState(false);
	const [progress, setProgress] = useState(0);
	const [dashboardError, setDashboardError] = useState('');
	const [composerMessage, setComposerMessage] = useState('');
	const [pendingAction, setPendingAction] = useState('');
	const outputEndRef = useRef(null);

	const loadProjects = async () => {
		const res = await axios.get(`${API}/projects`);
		setProjects(res.data);
	};

	const loadDatabases = async () => {
		const res = await axios.get(`${API}/databases`);
		setDatabases(res.data);
	};

	const refreshDashboard = async ({ silent = false } = {}) => {
		try {
			await Promise.all([loadProjects(), loadDatabases()]);
			setDashboardError('');
		} catch (error) {
			if (!silent) {
				setDashboardError(
					error.response?.data?.error ||
						'Failed to load project data. Make sure the backend is running.',
				);
			}
		}
	};

	useEffect(() => {
		refreshDashboard();

		const intervalId = window.setInterval(() => {
			refreshDashboard({ silent: true });
		}, REFRESH_INTERVAL_MS);

		return () => window.clearInterval(intervalId);
	}, []);

	useEffect(() => {
		outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [terminalOutput]);

	useEffect(() => {
		const returnedDraft = location.state?.projectComposerDraft;
		const returnedMessage = location.state?.composerMessage;

		if (!returnedDraft && !returnedMessage) {
			return;
		}

		if (returnedDraft) {
			setForm({
				...EMPTY_FORM,
				...returnedDraft,
			});
			setShowComposer(true);
		}

		if (returnedMessage) {
			setComposerMessage(returnedMessage);
		}

		navigate(location.pathname, { replace: true, state: null });
	}, [location.pathname, location.state, navigate]);

	const updateProgressFromLog = (message) => {
		if (message.includes('Creating Vite project')) {
			setProgress(10);
		} else if (message.includes('Installing npm dependencies')) {
			setProgress((previous) => Math.max(previous, 28));
		} else if (message.includes('Frontend created')) {
			setProgress(55);
		} else if (message.includes('Creating Node.js backend')) {
			setProgress(68);
		} else if (message.includes('Backend created')) {
			setProgress(90);
		} else if (message.includes('Project created successfully')) {
			setProgress(100);
		}
	};

	const resetForm = () => {
		setForm(EMPTY_FORM);
		setComposerMessage('');
	};

	const openDatabaseCreation = () => {
		setComposerMessage('');
		navigate('/databases', {
			state: {
				fromProjectComposer: true,
				projectComposerDraft: form,
			},
		});
	};

	const createProject = async () => {
		if (!form.name.trim()) {
			alert('Please enter a project name.');
			return;
		}

		if (!form.frontend && !form.backend && !form.databaseId) {
			alert('Choose at least one service or link a database.');
			return;
		}

		if (form.frontend && !form.frontendPort) {
			alert('Please enter a frontend port.');
			return;
		}

		if (form.backend && !form.backendPort) {
			alert('Please enter a backend port.');
			return;
		}

		if (
			form.frontend &&
			form.backend &&
			form.frontendPort === form.backendPort
		) {
			alert('Frontend and backend ports must be different.');
			return;
		}

		setShowTerminal(true);
		setIsCreating(true);
		setProgress(0);
		setTerminalOutput([
			{
				type: 'log',
				message: 'Starting project creation...',
				timestamp: new Date().toLocaleTimeString(),
			},
		]);

		try {
			const response = await fetch(`${API}/projects/create-stream`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form),
			});

			if (!response.ok) {
				const errorData = await response
					.json()
					.catch(() => ({ error: 'Project creation failed.' }));
				throw new Error(errorData.error || 'Project creation failed.');
			}

			if (!response.body) {
				throw new Error('Streaming output is unavailable.');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				const chunk = decoder.decode(value, { stream: true });
				for (const line of chunk.split('\n')) {
					if (!line.startsWith('data: ')) {
						continue;
					}

					const data = JSON.parse(line.slice(6));
					const entry = {
						...data,
						timestamp: new Date().toLocaleTimeString(),
					};

					setTerminalOutput((previous) => [...previous, entry]);

					if (data.type === 'log') {
						updateProgressFromLog(data.message);
					}

					if (data.type === 'complete') {
						setProgress(100);
						setIsCreating(false);
						resetForm();
						await refreshDashboard({ silent: true });

						window.setTimeout(() => {
							setShowTerminal(false);
							setTerminalOutput([]);
						}, 1800);
					}

					if (data.type === 'error') {
						setIsCreating(false);
					}
				}
			}
		} catch (error) {
			setTerminalOutput((previous) => [
				...previous,
				{
					type: 'error',
					message: `Error: ${error.message}`,
					timestamp: new Date().toLocaleTimeString(),
				},
			]);
			setIsCreating(false);
		}

		await refreshDashboard({ silent: true });
	};

	const runProjectAction = async (name, action, request) => {
		setPendingAction(`${action}:${name}`);
		broadcastProjectAction(name, action);

		try {
			await request();
			await refreshDashboard({ silent: true });
		} catch (error) {
			alert(error.response?.data?.error || error.message);
		} finally {
			setPendingAction('');
		}
	};

	const startProject = async (name) => {
		await runProjectAction(name, 'start', () =>
			axios.post(`${API}/projects/${encodeURIComponent(name)}/start`),
		);
	};

	const stopProject = async (name) => {
		await runProjectAction(name, 'stop', () =>
			axios.post(`${API}/projects/${encodeURIComponent(name)}/stop`),
		);
	};

	const deleteProject = async (name) => {
		if (!window.confirm(`Delete "${name}" and its local files?`)) {
			return;
		}

		await runProjectAction(name, 'delete', () =>
			axios.delete(`${API}/projects/${encodeURIComponent(name)}/delete`),
		);
	};

	const closeTerminal = () => {
		if (isCreating) {
			return;
		}

		setShowTerminal(false);
		setTerminalOutput([]);
	};

	const visibleProjects = [...projects]
		.filter((project) => {
			const matchesQuery = getProjectSearchText(project).includes(
				query.trim().toLowerCase(),
			);
			const matchesStatus =
				statusFilter === 'all' || project.status === statusFilter;

			return matchesQuery && matchesStatus;
		})
		.sort((left, right) => {
			const statusOrder = { running: 0, partial: 1, stopped: 2 };
			const leftOrder = statusOrder[left.status] ?? 3;
			const rightOrder = statusOrder[right.status] ?? 3;

			if (leftOrder !== rightOrder) {
				return leftOrder - rightOrder;
			}

			return left.name.localeCompare(right.name);
		});

	const activeProjects = projects.filter(
		(project) => project.status !== 'stopped',
	);
	const totalTaskCount = projects.reduce(
		(total, project) => total + (project.taskSummary?.total || 0),
		0,
	);
	const completedTaskCount = projects.reduce(
		(total, project) => total + (project.taskSummary?.completed || 0),
		0,
	);
	const databaseOptions = [
		{
			value: '',
			label: 'No database',
			description: 'Keep this project app-only for now.',
		},
		...databases.map((database) => ({
			value: database.id,
			label: database.name,
			description: `${database.type} on port ${database.port}`,
		})),
	];

	return (
		<div className='projects-page'>
			{showTerminal && (
				<div className='terminal-modal' onClick={closeTerminal}>
					<div
						className='terminal-container'
						onClick={(event) => event.stopPropagation()}>
						<div className='terminal-header'>
							<div>
								<p className='terminal-label'>Provisioning</p>
								<h3>Project creation log</h3>
							</div>
							<button
								onClick={closeTerminal}
								disabled={isCreating}>
								Close
							</button>
						</div>
						<div className='progress-bar-container'>
							<div
								className='progress-bar'
								style={{ width: `${progress}%` }}
							/>
						</div>
						<div className='terminal-content'>
							{terminalOutput.map((entry, index) => (
								<div
									key={`${entry.timestamp}-${index}`}
									className={`terminal-line ${entry.type}`}>
									<span className='timestamp'>
										[{entry.timestamp}]
									</span>
									{entry.message}
								</div>
							))}
							{isCreating && <div className='terminal-cursor' />}
							<div ref={outputEndRef} />
						</div>
					</div>
				</div>
			)}

			<section className='projects-toolbar-surface'>
				<div>
					<span className='section-tag'>Project Board</span>
					<h2>
						Launch, track, and shape each workspace from one clean
						board.
					</h2>
					<p>
						The project surface is now styled like a management
						product while keeping your real runtime actions intact.
						Tasks, runtime health, and databases all connect here
						without extra team overhead.
					</p>
				</div>

				<div className='projects-toolbar-actions'>
					<button
						type='button'
						className='secondary-action'
						onClick={() => refreshDashboard()}>
						<RefreshRounded fontSize='small' />
						Refresh
					</button>
					<button
						type='button'
						className='primary-action'
						onClick={() => setShowComposer((value) => !value)}>
						<AddRounded fontSize='small' />
						{showComposer ? 'Hide composer' : 'New project'}
					</button>
				</div>
			</section>

			<section className='project-meta-strip'>
				<article className='meta-strip-card'>
					<div className='meta-strip-icon blue'>
						<FolderRounded />
					</div>
					<div>
						<span>Total projects</span>
						<strong>{projects.length}</strong>
					</div>
				</article>
				<article className='meta-strip-card'>
					<div className='meta-strip-icon green'>
						<RocketLaunchRounded />
					</div>
					<div>
						<span>Live right now</span>
						<strong>{activeProjects.length}</strong>
					</div>
				</article>
				<article className='meta-strip-card'>
					<div className='meta-strip-icon amber'>
						<TaskAltRounded />
					</div>
					<div>
						<span>Tracked tasks</span>
						<strong>{totalTaskCount}</strong>
					</div>
				</article>
				<article className='meta-strip-card'>
					<div className='meta-strip-icon green'>
						<AssignmentTurnedInRounded />
					</div>
					<div>
						<span>Tasks done</span>
						<strong>{completedTaskCount}</strong>
					</div>
				</article>
			</section>

			{dashboardError && (
				<div className='panel-error'>{dashboardError}</div>
			)}
			{composerMessage && (
				<div className='panel-success'>{composerMessage}</div>
			)}

			<section className='project-control-band'>
				<label className='board-search'>
					<SearchRounded fontSize='small' />
					<input
						className='search-input'
						placeholder='Search projects, runtimes, or databases'
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</label>

				<div className='board-actions'>
					<SurfaceSelect
						value={statusFilter}
						onChange={setStatusFilter}
						options={STATUS_FILTER_OPTIONS}
						variant='compact'
						align='right'
						className='board-surface-select'
					/>

					<Link to='/databases' className='ghost-link'>
						<StorageRounded fontSize='small' />
						Open databases
					</Link>
				</div>
			</section>

			{showComposer && (
				<section className='composer-panel'>
					<div className='panel-header panel-header-spread'>
						<div>
							<span className='section-tag muted'>Composer</span>
							<h3>Create a new project</h3>
							<p>
								Spin up a new frontend, backend, or linked
								database without leaving the board.
							</p>
						</div>
						<div className='composer-note'>
							<ConstructionRounded fontSize='small' />
							<span>
								System ports and live listeners are checked
								automatically.
							</span>
						</div>
					</div>

					<div className='form-grid'>
						<label className='field-group field-wide'>
							<span>Project name</span>
							<input
								value={form.name}
								onChange={(event) =>
									setForm((previous) => ({
										...previous,
										name: event.target.value,
									}))
								}
								placeholder='project-name'
							/>
						</label>

						<div className='field-group'>
							<span>Frontend</span>
							<SurfaceSelect
								value={form.frontend}
								onChange={(nextValue) =>
									setForm((previous) => ({
										...previous,
										frontend: nextValue,
									}))
								}
								options={FRONTEND_OPTIONS}
							/>
						</div>

						<label className='field-group'>
							<span>Frontend port</span>
							<input
								type='number'
								value={form.frontendPort}
								onChange={(event) =>
									setForm((previous) => ({
										...previous,
										frontendPort: event.target.value,
									}))
								}
								placeholder='3000'
							/>
						</label>

						<div className='field-group'>
							<span>Backend</span>
							<SurfaceSelect
								value={form.backend}
								onChange={(nextValue) =>
									setForm((previous) => ({
										...previous,
										backend: nextValue,
									}))
								}
								options={BACKEND_OPTIONS}
							/>
						</div>

						<label className='field-group'>
							<span>Backend port</span>
							<input
								type='number'
								value={form.backendPort}
								onChange={(event) =>
									setForm((previous) => ({
										...previous,
										backendPort: event.target.value,
									}))
								}
								placeholder='5000'
							/>
						</label>

						<div className='field-group field-wide'>
							<div className='field-label-row'>
								<span>Linked database</span>
								<button
									type='button'
									className='inline-field-action'
									onClick={openDatabaseCreation}>
									<StorageRounded fontSize='inherit' />
									Create new database
								</button>
							</div>
							<SurfaceSelect
								value={form.databaseId}
								onChange={(nextValue) =>
									setForm((previous) => ({
										...previous,
										databaseId: nextValue,
									}))
								}
								options={databaseOptions}
							/>
							<p className='field-help'>
								Need a fresh local database? Create it in the
								databases workspace and come right back here
								with it selected.
							</p>
						</div>
					</div>

					<div className='form-actions'>
						<button
							type='button'
							className='ghost-button'
							onClick={resetForm}>
							Reset
						</button>
						<button
							type='button'
							className='primary-action'
							onClick={createProject}
							disabled={isCreating}>
							<TerminalRounded fontSize='small' />
							{isCreating ? 'Creating...' : 'Create project'}
						</button>
					</div>
				</section>
			)}

			<section className='project-grid-board'>
				{visibleProjects.length > 0 ? (
					visibleProjects.map((project) => {
						const projectProgress = getProjectProgress(project);
						const primaryUrl = getPrimaryProjectUrl(project);
						const projectCrew = getProjectCrew(project);

						return (
							<article
								key={project.name}
								className={`project-board-card status-${project.status}`}>
								<div className='project-card-top'>
									<div>
										<div className='card-badges'>
											<span
												className={`status-pill ${project.status}`}>
												{getStatusLabel(project.status)}
											</span>
											{project.database && (
												<span className='meta-pill'>
													{project.database.type}
												</span>
											)}
										</div>
										<Link
											to={`/projects/${encodeURIComponent(project.name)}`}
											className='project-link'>
											<h3>{project.name}</h3>
										</Link>
										<p>{getProjectSummary(project)}</p>
									</div>

									<div className='project-port-cluster'>
										{project.frontendPort && (
											<span className='port-pill frontend'>
												<PublicRounded fontSize='inherit' />
												<span>Web</span>
												<strong>
													:{project.frontendPort}
												</strong>
											</span>
										)}
										{project.backendPort && (
											<span className='port-pill backend'>
												<HubRounded fontSize='inherit' />
												<span>API</span>
												<strong>
													:{project.backendPort}
												</strong>
											</span>
										)}
									</div>
								</div>

								<div className='progress-block'>
									<div className='progress-meta'>
										<span>Workspace progress</span>
										<strong>{projectProgress}%</strong>
									</div>
									<div className='progress-track'>
										<span
											style={{
												width: `${projectProgress}%`,
											}}
										/>
									</div>
								</div>

								<div className='project-task-row'>
									<div className='task-stat'>
										<span>Total tasks</span>
										<strong>
											{project.taskSummary?.total || 0}
										</strong>
									</div>
									<div className='task-stat'>
										<span>Completed</span>
										<strong>
											{project.taskSummary?.completed ||
												0}
										</strong>
									</div>
									<div className='task-stat'>
										<span>Open</span>
										<strong>
											{project.taskSummary?.pending || 0}
										</strong>
									</div>
								</div>

								<div className='project-card-middle'>
									<div className='avatar-group'>
										{projectCrew.map((entry) => (
											<div
												key={entry.label}
												className={`avatar-chip ${entry.accent}`}>
												{entry.label}
											</div>
										))}
									</div>

									<div className='service-tags'>
										{project.frontend && (
											<span>
												<PublicRounded fontSize='inherit' />
												Frontend
											</span>
										)}
										{project.backend && (
											<span>
												<HubRounded fontSize='inherit' />
												Backend
											</span>
										)}
										{project.database && (
											<span>
												<DnsRounded fontSize='inherit' />
												Database
											</span>
										)}
									</div>
								</div>

								<div className='project-card-actions'>
									<div className='project-card-link-row'>
										<Link
											to={`/projects/${encodeURIComponent(project.name)}`}
											className='ghost-link project-inline-action'>
											<ArrowOutwardRounded fontSize='small' />
											Open
										</Link>

										<Link
											to={`/tasks?project=${encodeURIComponent(project.name)}`}
											className='ghost-link project-inline-action'>
											<TaskAltRounded fontSize='small' />
											Tasks
										</Link>

										{primaryUrl && (
											<a
												href={primaryUrl}
												target='_blank'
												rel='noopener noreferrer'
												className='secondary-link project-inline-action'>
												<LanRounded fontSize='small' />
												Preview
											</a>
										)}
									</div>

									<div className='project-card-runtime-row'>
										{project.status === 'stopped' ? (
											<button
												type='button'
												className='success-button project-inline-action'
												disabled={
													pendingAction ===
													`start:${project.name}`
												}
												onClick={() =>
													startProject(project.name)
												}>
												<PlayArrowRounded fontSize='small' />
												{pendingAction ===
												`start:${project.name}`
													? 'Starting...'
													: 'Start'}
											</button>
										) : (
											<button
												type='button'
												className='danger-button project-inline-action'
												disabled={
													pendingAction ===
													`stop:${project.name}`
												}
												onClick={() =>
													stopProject(project.name)
												}>
												<StopRounded fontSize='small' />
												{pendingAction ===
												`stop:${project.name}`
													? 'Stopping...'
													: 'Stop'}
											</button>
										)}

										<button
											type='button'
											className='text-button project-delete-button'
											disabled={
												pendingAction ===
												`delete:${project.name}`
											}
											onClick={() =>
												deleteProject(project.name)
											}>
											<DeleteOutlineRounded fontSize='small' />
											Delete
										</button>
									</div>
								</div>
							</article>
						);
					})
				) : (
					<div className='empty-board-state'>
						<div className='empty-board-icon'>
							<FolderRounded />
						</div>
						<h3>No projects match this view yet.</h3>
						<p>
							Adjust the search or filters, or create a new
							workspace to start populating the board.
						</p>
					</div>
				)}
			</section>
		</div>
	);
}

export default Overview;
