import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import PendingActionsRounded from '@mui/icons-material/PendingActionsRounded';
import StorageRounded from '@mui/icons-material/StorageRounded';
import ViewKanbanRounded from '@mui/icons-material/ViewKanbanRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import AssignmentLateRounded from '@mui/icons-material/AssignmentLateRounded';
import './DashboardHome.css';

const API = 'http://localhost:4000';
const TASK_COLUMNS = [
	{ key: 'backlog', title: 'Backlog' },
	{ key: 'in_progress', title: 'In progress' },
	{ key: 'review', title: 'Review' },
];

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
		return 58;
	}

	return 22;
}

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

function DashboardHome() {
	const [projects, setProjects] = useState([]);
	const [databases, setDatabases] = useState([]);
	const [tasks, setTasks] = useState([]);
	const [error, setError] = useState('');

	useEffect(() => {
		const loadDashboard = async () => {
			try {
				const [projectsResponse, databasesResponse, tasksResponse] =
					await Promise.all([
						axios.get(`${API}/projects`),
						axios.get(`${API}/databases`),
						axios.get(`${API}/tasks`),
					]);
				setProjects(projectsResponse.data);
				setDatabases(databasesResponse.data);
				setTasks(tasksResponse.data);
				setError('');
			} catch (loadError) {
				setError(
					loadError.response?.data?.error ||
						'Unable to load dashboard data right now.',
				);
			}
		};

		loadDashboard();
	}, []);

	const activeProjects = projects.filter(
		(project) => project.status !== 'stopped',
	);
	const previewProjects = [...projects]
		.sort(
			(left, right) =>
				getProjectProgress(right) - getProjectProgress(left),
		)
		.slice(0, 4);
	const completedTasks = tasks.filter(
		(task) => task.status === 'done',
	).length;
	const pendingTasks = tasks.filter((task) => task.status !== 'done').length;
	const overdueTasks = tasks.filter((task) => task.overdue).length;
	const activeServices = projects.reduce(
		(total, project) => total + (project.runtime?.activeServiceCount || 0),
		0,
	);
	const expectedServices = projects.reduce(
		(total, project) =>
			total + (project.runtime?.expectedServiceCount || 0),
		0,
	);
	const previewDatabases = databases.slice(0, 3);

	return (
		<div className='dashboard-page'>
			<section className='dashboard-hero'>
				<div className='hero-copy'>
					<span className='section-tag'>Workspace OS</span>
					<h2>
						Track delivery, workloads, and runtime state from one
						management dashboard.
					</h2>
					<p>
						Projects, tasks, and local services now move together.
						Progress is calculated from task completion, while
						runtime and infrastructure controls stay visible in the
						same shell.
					</p>
				</div>

				<div className='hero-actions'>
					<Link to='/projects' className='primary-action'>
						<FolderRounded fontSize='small' />
						Open projects
					</Link>
					<Link to='/tasks' className='secondary-action'>
						<ViewKanbanRounded fontSize='small' />
						Open tasks
					</Link>
				</div>
			</section>

			{error && <div className='dashboard-alert'>{error}</div>}

			<section className='dashboard-metrics'>
				<article className='metric-card'>
					<div className='metric-icon blue'>
						<FolderRounded />
					</div>
					<div>
						<span>Total Projects</span>
						<strong>{projects.length}</strong>
						<p>
							Launchable workspaces currently tracked in the
							dashboard.
						</p>
					</div>
				</article>
				<article className='metric-card'>
					<div className='metric-icon green'>
						<TaskAltRounded />
					</div>
					<div>
						<span>Tasks Completed</span>
						<strong>
							{completedTasks.toString().padStart(2, '0')}
						</strong>
						<p>Real completed work across all projects.</p>
					</div>
				</article>
				<article className='metric-card'>
					<div className='metric-icon amber'>
						<PendingActionsRounded />
					</div>
					<div>
						<span>Tasks Pending</span>
						<strong>
							{pendingTasks.toString().padStart(2, '0')}
						</strong>
						<p>Open work items still moving through delivery.</p>
					</div>
				</article>
				<article className='metric-card'>
					<div className='metric-icon slate'>
						<BoltRounded />
					</div>
					<div>
						<span>Live Services</span>
						<strong>
							{activeServices.toString().padStart(2, '0')}
						</strong>
						<p>
							{expectedServices || 0} tracked services across all
							projects.
						</p>
					</div>
				</article>
			</section>

			<section className='dashboard-columns'>
				<article className='dashboard-panel'>
					<div className='panel-header panel-header-spread'>
						<div>
							<span className='section-tag muted'>
								Project Pulse
							</span>
							<h3>Live workspace health</h3>
						</div>
						<Link to='/projects' className='ghost-link'>
							<ArrowOutwardRounded fontSize='small' />
							View all
						</Link>
					</div>

					<div className='health-list'>
						{previewProjects.length > 0 ? (
							previewProjects.map((project) => {
								const progress = getProjectProgress(project);

								return (
									<Link
										key={project.name}
										to={`/projects/${encodeURIComponent(project.name)}`}
										className='health-item'>
										<div className='health-row'>
											<div>
												<strong>{project.name}</strong>
												<p>
													{project.taskSummary
														?.total || 0}{' '}
													tasks
													{' | '}
													{project.taskSummary
														?.completed || 0}{' '}
													completed
												</p>
											</div>
											<span
												className={`status-pill ${project.status}`}>
												{getStatusLabel(project.status)}
											</span>
										</div>
										<div className='health-track'>
											<span
												style={{
													width: `${progress}%`,
												}}
											/>
										</div>
										<div className='health-meta'>
											<span>{progress}% complete</span>
											<span>
												{project.database
													? project.database.name
													: 'No DB linked'}
											</span>
										</div>
									</Link>
								);
							})
						) : (
							<div className='dashboard-empty'>
								Create your first project to populate this
								dashboard lane.
							</div>
						)}
					</div>
				</article>

				<article className='dashboard-panel future-panel'>
					<div className='panel-header'>
						<span className='section-tag muted'>
							Delivery Signals
						</span>
						<h3>What needs attention right now</h3>
						<p>
							Stay aware of open work, overdue tasks, local
							runtime activity, and tracked services without
							leaving the home view.
						</p>
					</div>

					<div className='future-grid'>
						<div className='future-card'>
							<div className='future-icon blue'>
								<ViewKanbanRounded />
							</div>
							<div>
								<h4>{pendingTasks} open tasks</h4>
								<p>
									Use the board to move work through backlog,
									in progress, review, and done.
								</p>
							</div>
						</div>
						<div className='future-card'>
							<div className='future-icon green'>
								<StorageRounded />
							</div>
							<div>
								<h4>{databases.length} tracked databases</h4>
								<p>
									Keep local infrastructure linked to projects
									without leaving the dashboard.
								</p>
							</div>
						</div>
						<div className='future-card'>
							<div className='future-icon amber'>
								<AssignmentLateRounded />
							</div>
							<div>
								<h4>{overdueTasks} overdue tasks</h4>
								<p>
									Due dates now surface directly in the task
									board and project progress.
								</p>
							</div>
						</div>
						<div className='future-card'>
							<div className='future-icon slate'>
								<BoltRounded />
							</div>
							<div>
								<h4>{activeProjects.length} live workspaces</h4>
								<p>
									Runtime and project management are finally
									connected in one place.
								</p>
							</div>
						</div>
					</div>
				</article>
			</section>

			<section className='dashboard-preview-grid'>
				<article className='dashboard-panel notion-panel'>
					<div className='panel-header panel-header-spread'>
						<div>
							<span className='section-tag muted'>
								Task Board
							</span>
							<h3>Current flow by status</h3>
						</div>
						<Link to='/tasks' className='ghost-link'>
							<ArrowOutwardRounded fontSize='small' />
							Open tasks
						</Link>
					</div>
					<div className='kanban-preview'>
						{TASK_COLUMNS.map((column) => {
							const columnTasks = tasks
								.filter((task) => task.status === column.key)
								.slice(0, 3);

							return (
								<div key={column.key} className='kanban-column'>
									<div className='kanban-column-head'>
										<strong>{column.title}</strong>
										<span>{columnTasks.length}</span>
									</div>
									<div className='kanban-card-stack'>
										{columnTasks.length > 0 ? (
											columnTasks.map((task) => (
												<div
													key={task.id}
													className='kanban-card'>
													<span className='mini-badge'>
														{task.priority}
													</span>
													<strong>
														{task.title}
													</strong>
													<p>
														{task.projectName ||
															'General'}{' '}
														|{' '}
														{task.dueDate ||
															'No due date'}
													</p>
												</div>
											))
										) : (
											<div className='kanban-card empty'>
												<strong>
													No tasks here yet
												</strong>
												<p>
													New work in this lane will
													appear automatically.
												</p>
											</div>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</article>

				<article className='dashboard-panel directory-panel'>
					<div className='panel-header panel-header-spread'>
						<div>
							<span className='section-tag muted'>
								Infrastructure
							</span>
							<h3>Databases and local tooling</h3>
						</div>
						<Link to='/databases' className='ghost-link'>
							<ArrowOutwardRounded fontSize='small' />
							Open databases
						</Link>
					</div>

					<div className='member-grid'>
						{previewDatabases.length > 0 ? (
							previewDatabases.map((database) => (
								<div key={database.id} className='member-card'>
									<div
										className={`member-avatar ${
											database.clientPort
												? 'blue'
												: 'slate'
										}`}>
										DB
									</div>
									<div>
										<strong>{database.name}</strong>
										<p>
											{database.type} on port{' '}
											{database.port}
										</p>
										<p>
											{database.clientPort
												? `Client available on port ${database.clientPort}`
												: 'No admin client exposed'}
										</p>
									</div>
								</div>
							))
						) : (
							<div className='dashboard-empty'>
								Create a database service to keep infrastructure
								visible here.
							</div>
						)}
					</div>

					<div className='directory-footer'>
						<span>
							{databases.length} infrastructure services tracked
						</span>
						<span>
							{activeServices} of {expectedServices || 0} local
							services live
						</span>
					</div>
				</article>
			</section>
		</div>
	);
}

export default DashboardHome;
