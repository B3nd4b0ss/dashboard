import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import AssignmentTurnedInRounded from '@mui/icons-material/AssignmentTurnedInRounded';
import FilterListRounded from '@mui/icons-material/FilterListRounded';
import PendingActionsRounded from '@mui/icons-material/PendingActionsRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { API_BASE_URL } from '../config/api';
import SurfaceSelect from './SurfaceSelect';
import TaskEditorModal from './TaskEditorModal';
import {
	buildNextSearchParams,
	buildNextTextSearchParams,
	getSearchParamValue,
} from '../utils/searchParams';
import {
	EMPTY_TASK_FORM,
	PRIORITY_OPTIONS,
	TASK_STATUS_OPTIONS,
	getProjectLabel,
} from '../utils/taskPresentation';
import './TasksBoard.css';

const API = API_BASE_URL;
const STATUS_COLUMNS = TASK_STATUS_OPTIONS.map((option) => ({
	key: option.value,
	label: option.label,
	description: option.description,
}));

/**
 * Renders the kanban-style task board with create and edit flows.
 *
 * @returns {JSX.Element} Tasks board page.
 */
function TasksBoard() {
	const [searchParams, setSearchParams] = useSearchParams();
	const initialProjectFilter = searchParams.get('project') || 'all';
	const [tasks, setTasks] = useState([]);
	const [projects, setProjects] = useState([]);
	const query = getSearchParamValue(searchParams, 'q');
	const [projectFilter, setProjectFilter] = useState(initialProjectFilter);
	const [priorityFilter, setPriorityFilter] = useState('all');
	const [statusFilter, setStatusFilter] = useState('all');
	const [showEditor, setShowEditor] = useState(false);
	const [editingTask, setEditingTask] = useState(null);
	const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
	const [pageError, setPageError] = useState('');
	const [pageNotice, setPageNotice] = useState('');
	const [savingTask, setSavingTask] = useState(false);

	const loadBoardData = async () => {
		const [tasksResponse, projectsResponse] = await Promise.all([
			axios.get(`${API}/tasks`),
			axios.get(`${API}/projects`),
		]);

		setTasks(tasksResponse.data);
		setProjects(projectsResponse.data);
	};

	const refreshBoard = async () => {
		try {
			await loadBoardData();
			setPageError('');
		} catch (error) {
			setPageError(
				error.response?.data?.error ||
					'Unable to load tickets right now.',
			);
		}
	};

	useEffect(() => {
		refreshBoard();
	}, []);

	useEffect(() => {
		const nextProjectFilter = searchParams.get('project');
		setProjectFilter(
			nextProjectFilter === null ? 'all' : nextProjectFilter,
		);
	}, [searchParams]);

	const resetTaskForm = (projectName = '') => {
		setTaskForm({
			...EMPTY_TASK_FORM,
			projectName:
				projectName && projectName !== 'all' ? projectName : '',
		});
		setEditingTask(null);
	};

	const openCreateTask = () => {
		resetTaskForm(projectFilter);
		setShowEditor(true);
	};

	const closeEditor = () => {
		setShowEditor(false);
		resetTaskForm(projectFilter);
	};

	const saveTask = async () => {
		if (!taskForm.title.trim()) {
			alert('Task title required.');
			return;
		}

		setSavingTask(true);

		try {
			const payload = {
				...taskForm,
				projectName: taskForm.projectName || null,
				assigneeId: null,
				dueDate: taskForm.dueDate || null,
			};

			if (editingTask) {
				await axios.patch(`${API}/tasks/${editingTask.id}`, payload);
				setPageNotice('Ticket updated.');
			} else {
				await axios.post(`${API}/tasks`, payload);
				setPageNotice('Ticket created.');
			}

			await refreshBoard();
			closeEditor();
		} catch (error) {
			alert(error.response?.data?.error || 'Failed to save ticket.');
		} finally {
			setSavingTask(false);
		}
	};

	const handleProjectFilterChange = (value) => {
		setProjectFilter(value);
		setSearchParams(
			buildNextSearchParams(searchParams, {
				project: value === 'all' ? null : value,
			}),
			{ replace: true },
		);
	};

	const handleQueryChange = (event) => {
		setSearchParams(
			buildNextTextSearchParams(searchParams, 'q', event.target.value),
			{ replace: true },
		);
	};

	const visibleTasks = tasks.filter((task) => {
		const matchesQuery = [task.ticketKey, task.title, task.projectName]
			.filter(Boolean)
			.join(' ')
			.toLowerCase()
			.includes(query.trim().toLowerCase());
		const matchesProject =
			projectFilter === 'all'
				? true
				: projectFilter === ''
					? !task.projectName
					: task.projectName === projectFilter;
		const matchesPriority =
			priorityFilter === 'all' || task.priority === priorityFilter;
		const matchesStatus =
			statusFilter === 'all' || task.status === statusFilter;

		return (
			matchesQuery && matchesProject && matchesPriority && matchesStatus
		);
	});

	const totalTasks = tasks.length;
	const completedTasks = tasks.filter(
		(task) => task.status === 'done',
	).length;
	const pendingTasks = tasks.filter((task) => task.status !== 'done').length;
	const overdueTasks = tasks.filter((task) => task.overdue).length;
	const projectFilterOptions = [
		{
			value: 'all',
			label: 'All projects',
			description: 'Show tickets from every project.',
		},
		{
			value: '',
			label: 'General only',
			description: 'Only tickets without a linked project.',
		},
		...projects.map((project) => ({
			value: project.name,
			label: project.name,
			description: `${project.taskSummary?.total || 0} tracked tasks`,
		})),
	];
	const priorityFilterOptions = [
		{
			value: 'all',
			label: 'All priorities',
			description: 'Show every urgency level.',
		},
		...PRIORITY_OPTIONS,
	];
	const statusFilterOptions = [
		{
			value: 'all',
			label: 'All statuses',
			description: 'Show every workflow stage.',
		},
		...TASK_STATUS_OPTIONS,
	];

	return (
		<div className='tasks-page'>
			<TaskEditorModal
				open={showEditor}
				onClose={closeEditor}
				onSave={saveTask}
				taskForm={taskForm}
				setTaskForm={setTaskForm}
				editingTask={editingTask}
				projects={projects}
				tasks={tasks}
				savingTask={savingTask}
			/>

			<section className='tasks-hero'>
				<div className='tasks-hero-copy'>
					<span className='section-tag'>Tickets</span>
					<h2>
						Open a ticket by title, then work from its full detail
						page.
					</h2>
					<p>
						This view stays lightweight on purpose. You only scan
						the ticket title and project here, then jump into the
						ticket itself for status, notes, due dates, and branch
						actions.
					</p>
				</div>
				<div className='tasks-hero-actions'>
					<button
						type='button'
						className='secondary-action'
						onClick={refreshBoard}
					>
						<RefreshRounded fontSize='small' />
						Refresh
					</button>
					<button
						type='button'
						className='primary-action'
						onClick={openCreateTask}
					>
						<AddRounded fontSize='small' />
						New ticket
					</button>
				</div>
			</section>

			<section className='task-metrics'>
				<article className='task-metric-card'>
					<div className='task-metric-icon blue'>
						<TaskAltRounded />
					</div>
					<div className='task-metric-copy'>
						<span>Total tickets</span>
						<strong>{totalTasks}</strong>
					</div>
				</article>
				<article className='task-metric-card'>
					<div className='task-metric-icon green'>
						<AssignmentTurnedInRounded />
					</div>
					<div className='task-metric-copy'>
						<span>Completed</span>
						<strong>{completedTasks}</strong>
					</div>
				</article>
				<article className='task-metric-card'>
					<div className='task-metric-icon amber'>
						<PendingActionsRounded />
					</div>
					<div className='task-metric-copy'>
						<span>Pending</span>
						<strong>{pendingTasks}</strong>
					</div>
				</article>
				<article className='task-metric-card'>
					<div className='task-metric-icon danger'>
						<WarningAmberRounded />
					</div>
					<div className='task-metric-copy'>
						<span>Overdue</span>
						<strong>{overdueTasks}</strong>
					</div>
				</article>
			</section>

			{pageError && <div className='panel-error'>{pageError}</div>}
			{pageNotice && <div className='panel-success'>{pageNotice}</div>}

			<section className='tasks-filter-bar'>
				<label className='board-search'>
					<SearchRounded fontSize='small' />
					<input
						className='search-input'
						placeholder='Search ticket titles or project names'
						value={query}
						onChange={handleQueryChange}
					/>
				</label>

				<div className='tasks-filter-actions'>
					<div className='filter-chip'>
						<FilterListRounded fontSize='small' />
						<SurfaceSelect
							value={projectFilter}
							onChange={handleProjectFilterChange}
							options={projectFilterOptions}
							variant='compact'
							align='right'
						/>
					</div>

					<div className='filter-chip'>
						<TaskAltRounded fontSize='small' />
						<SurfaceSelect
							value={statusFilter}
							onChange={setStatusFilter}
							options={statusFilterOptions}
							variant='compact'
							align='right'
						/>
					</div>

					<div className='filter-chip'>
						<WarningAmberRounded fontSize='small' />
						<SurfaceSelect
							value={priorityFilter}
							onChange={setPriorityFilter}
							options={priorityFilterOptions}
							variant='compact'
							align='right'
						/>
					</div>
				</div>
			</section>

			<section className='task-list-shell'>
				<div className='task-list-header'>
					<span className='section-tag muted'>Ticket index</span>
					<strong>{visibleTasks.length} tickets visible</strong>
				</div>

				<div className='task-board-shell'>
					<section className='task-board'>
						{STATUS_COLUMNS.map((column) => {
							const columnTasks = visibleTasks.filter(
								(task) => task.status === column.key,
							);

							return (
								<div key={column.key} className='task-column'>
									<div className='task-column-head'>
										<div className='task-column-title'>
											<span
												className={`task-column-marker column-${column.key}`}
											/>
											<div>
												<strong>{column.label}</strong>
												<p>{column.description}</p>
											</div>
										</div>
										<span className='task-column-count'>
											{columnTasks.length}
										</span>
									</div>

									<div className='task-column-body'>
										{columnTasks.length > 0 ? (
											columnTasks.map((task) => (
												<Link
													key={task.id}
													to={`/tasks/${encodeURIComponent(
														task.id,
													)}`}
													className='task-list-row'
												>
													<div className='task-list-copy'>
														<strong>
															{task.title}
														</strong>
														<span>
															{getProjectLabel(
																task,
															)}
														</span>
													</div>
													<div className='task-list-arrow'>
														<ArrowOutwardRounded fontSize='small' />
													</div>
												</Link>
											))
										) : (
											<div className='task-column-empty'>
												No tickets in{' '}
												{column.label.toLowerCase()}.
											</div>
										)}
									</div>
								</div>
							);
						})}
					</section>
				</div>
			</section>

			<section className='tasks-footer-strip'>
				<Link to='/projects' className='ghost-link'>
					<ArrowOutwardRounded fontSize='small' />
					Back to projects
				</Link>
			</section>
		</div>
	);
}

export default TasksBoard;
