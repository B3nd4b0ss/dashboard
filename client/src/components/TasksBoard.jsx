import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import AssignmentTurnedInRounded from '@mui/icons-material/AssignmentTurnedInRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import EventRounded from '@mui/icons-material/EventRounded';
import FilterListRounded from '@mui/icons-material/FilterListRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import PendingActionsRounded from '@mui/icons-material/PendingActionsRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import SurfaceSelect from './SurfaceSelect';
import {
	buildNextSearchParams,
	buildNextTextSearchParams,
	getSearchParamValue,
} from '../utils/searchParams';
import './TasksBoard.css';

const API = 'http://localhost:4000';
const STATUS_COLUMNS = [
	{ key: 'backlog', label: 'Backlog' },
	{ key: 'in_progress', label: 'In Progress' },
	{ key: 'review', label: 'Review' },
	{ key: 'done', label: 'Done' },
];

const TASK_STATUS_OPTIONS = [
	{
		value: 'backlog',
		label: 'Backlog',
		description: 'Ideas and tasks not started yet.',
	},
	{
		value: 'in_progress',
		label: 'In Progress',
		description: 'Work that is actively moving.',
	},
	{
		value: 'review',
		label: 'Review',
		description: 'Tasks waiting for a final pass.',
	},
	{
		value: 'done',
		label: 'Done',
		description: 'Finished work items.',
	},
];

const PRIORITY_OPTIONS = [
	{
		value: 'low',
		label: 'Low',
		description: 'Nice to have, lower urgency.',
	},
	{
		value: 'medium',
		label: 'Medium',
		description: 'Standard work priority.',
	},
	{
		value: 'high',
		label: 'High',
		description: 'Important and time-sensitive.',
	},
	{
		value: 'urgent',
		label: 'Urgent',
		description: 'Needs attention as soon as possible.',
	},
];

const EMPTY_TASK_FORM = {
	title: '',
	description: '',
	projectName: '',
	status: 'backlog',
	priority: 'medium',
	dueDate: '',
};

function getStatusLabel(status) {
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

function getPriorityLabel(priority) {
	switch (priority) {
		case 'urgent':
			return 'Urgent';
		case 'high':
			return 'High';
		case 'low':
			return 'Low';
		default:
			return 'Medium';
	}
}

function getProjectLabel(task) {
	return task.projectName || 'General';
}

function TasksBoard() {
	const [searchParams, setSearchParams] = useSearchParams();
	const initialProjectFilter = searchParams.get('project') || 'all';
	const [tasks, setTasks] = useState([]);
	const [projects, setProjects] = useState([]);
	const query = getSearchParamValue(searchParams, 'q');
	const [projectFilter, setProjectFilter] = useState(initialProjectFilter);
	const [priorityFilter, setPriorityFilter] = useState('all');
	const [showEditor, setShowEditor] = useState(false);
	const [editingTask, setEditingTask] = useState(null);
	const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
	const [pageError, setPageError] = useState('');
	const [savingTask, setSavingTask] = useState(false);
	const [busyAction, setBusyAction] = useState('');

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
					'Unable to load tasks right now.',
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

	const openEditTask = (task) => {
		setEditingTask(task);
		setTaskForm({
			title: task.title || '',
			description: task.description || '',
			projectName: task.projectName || '',
			status: task.status || 'backlog',
			priority: task.priority || 'medium',
			dueDate: task.dueDate || '',
		});
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
			} else {
				await axios.post(`${API}/tasks`, payload);
			}

			await refreshBoard();
			closeEditor();
		} catch (error) {
			alert(error.response?.data?.error || 'Failed to save task.');
		} finally {
			setSavingTask(false);
		}
	};

	const deleteTask = async (taskId) => {
		if (!window.confirm('Delete this task?')) {
			return;
		}

		setBusyAction(`delete:${taskId}`);

		try {
			await axios.delete(`${API}/tasks/${taskId}`);
			await refreshBoard();
		} catch (error) {
			alert(error.response?.data?.error || 'Failed to delete task.');
		} finally {
			setBusyAction('');
		}
	};

	const toggleTaskDone = async (task) => {
		const nextStatus = task.status === 'done' ? 'backlog' : 'done';
		setBusyAction(`toggle:${task.id}`);

		try {
			await axios.patch(`${API}/tasks/${task.id}`, {
				status: nextStatus,
			});
			await refreshBoard();
		} catch (error) {
			alert(error.response?.data?.error || 'Failed to update task.');
		} finally {
			setBusyAction('');
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
		const matchesQuery = [
			task.title,
			task.description,
			task.projectName,
			task.priority,
		]
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

		return matchesQuery && matchesProject && matchesPriority;
	});

	const totalTasks = tasks.length;
	const completedTasks = tasks.filter(
		(task) => task.status === 'done',
	).length;
	const pendingTasks = tasks.filter((task) => task.status !== 'done').length;
	const overdueTasks = tasks.filter((task) => task.overdue).length;
	const projectOptions = [
		{
			value: '',
			label: 'General',
			description: 'Task is not linked to one project.',
		},
		...projects.map((project) => ({
			value: project.name,
			label: project.name,
			description: getStatusLabel(project.status),
		})),
	];
	const projectFilterOptions = [
		{
			value: 'all',
			label: 'All projects',
			description: 'Show tasks from every project.',
		},
		{
			value: '',
			label: 'General only',
			description: 'Only tasks without a linked project.',
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

	return (
		<div className='tasks-page'>
			{showEditor && (
				<div className='task-modal-overlay' onClick={closeEditor}>
					<div
						className='task-modal-card'
						onClick={(event) => event.stopPropagation()}>
						<div className='task-modal-header'>
							<div>
								<span className='section-tag muted'>
									Task Editor
								</span>
								<h3>
									{editingTask ? 'Edit task' : 'Create task'}
								</h3>
								<p>
									Link work to a project and keep the next
									step clearly visible.
								</p>
							</div>
							<button
								type='button'
								className='ghost-button'
								onClick={closeEditor}>
								Close
							</button>
						</div>

						<div className='task-form-grid'>
							<label className='field-group field-wide'>
								<span>Title</span>
								<input
									value={taskForm.title}
									onChange={(event) =>
										setTaskForm((previous) => ({
											...previous,
											title: event.target.value,
										}))
									}
								/>
							</label>

							<label className='field-group field-wide'>
								<span>Description</span>
								<textarea
									value={taskForm.description}
									onChange={(event) =>
										setTaskForm((previous) => ({
											...previous,
											description: event.target.value,
										}))
									}
									rows={5}
								/>
							</label>

							<label className='field-group'>
								<span>Project</span>
								<SurfaceSelect
									value={taskForm.projectName}
									onChange={(nextValue) =>
										setTaskForm((previous) => ({
											...previous,
											projectName: nextValue,
										}))
									}
									options={projectOptions}
								/>
							</label>

							<label className='field-group'>
								<span>Status</span>
								<SurfaceSelect
									value={taskForm.status}
									onChange={(nextValue) =>
										setTaskForm((previous) => ({
											...previous,
											status: nextValue,
										}))
									}
									options={TASK_STATUS_OPTIONS}
								/>
							</label>

							<label className='field-group'>
								<span>Priority</span>
								<SurfaceSelect
									value={taskForm.priority}
									onChange={(nextValue) =>
										setTaskForm((previous) => ({
											...previous,
											priority: nextValue,
										}))
									}
									options={PRIORITY_OPTIONS}
								/>
							</label>

							<label className='field-group'>
								<span>Due date</span>
								<input
									type='date'
									value={taskForm.dueDate}
									onChange={(event) =>
										setTaskForm((previous) => ({
											...previous,
											dueDate: event.target.value,
										}))
									}
								/>
							</label>
						</div>

						<div className='task-modal-actions'>
							<button
								type='button'
								className='ghost-button'
								onClick={closeEditor}>
								Cancel
							</button>
							<button
								type='button'
								className='primary-action'
								onClick={saveTask}
								disabled={savingTask}>
								{savingTask
									? 'Saving...'
									: editingTask
										? 'Save task'
										: 'Create task'}
							</button>
						</div>
					</div>
				</div>
			)}

			<section className='tasks-hero'>
				<div className='tasks-hero-copy'>
					<span className='section-tag'>Task System</span>
					<h2>
						Manage project work with statuses, priorities, and due
						dates.
					</h2>
					<p>
						Tasks now connect directly to your projects so progress
						bars and delivery summaries stay current without manual
						bookkeeping.
					</p>
				</div>
				<div className='tasks-hero-actions'>
					<button
						type='button'
						className='secondary-action'
						onClick={refreshBoard}>
						<RefreshRounded fontSize='small' />
						Refresh
					</button>
					<button
						type='button'
						className='primary-action'
						onClick={openCreateTask}>
						<AddRounded fontSize='small' />
						New task
					</button>
				</div>
			</section>

			<section className='task-metrics'>
				<article className='task-metric-card'>
					<div className='task-metric-icon blue'>
						<TaskAltRounded />
					</div>
					<div className='task-metric-copy'>
						<span>Total tasks</span>
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

			<section className='tasks-filter-bar'>
				<label className='board-search'>
					<SearchRounded fontSize='small' />
					<input
						className='search-input'
						placeholder='Search tasks, descriptions, projects, or priorities'
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
											<p>{columnTasks.length} tasks</p>
										</div>
									</div>
									<span className='task-column-count'>
										{columnTasks.length}
									</span>
								</div>

								<div className='task-column-body'>
									{columnTasks.length > 0 ? (
										columnTasks.map((task) => (
											<article
												key={task.id}
												className='task-card'>
												<div className='task-card-head'>
													<div className='task-card-copy'>
														<div className='task-chip-row'>
															<span
																className={`task-status-pill status-${task.status}`}>
																{getStatusLabel(
																	task.status,
																)}
															</span>
															<span
																className={`task-priority-pill priority-${task.priority}`}>
																{getPriorityLabel(
																	task.priority,
																)}
															</span>
														</div>
														<h3>{task.title}</h3>
													</div>
												</div>

												{task.description && (
													<p className='task-card-description'>
														{task.description}
													</p>
												)}

												<div className='task-meta-list'>
													<div className='task-meta-item'>
														<FolderRounded fontSize='inherit' />
														{task.projectName ? (
															<Link
																to={`/projects/${encodeURIComponent(
																	task.projectName,
																)}`}>
																{getProjectLabel(
																	task,
																)}
															</Link>
														) : (
															<span>
																{getProjectLabel(
																	task,
																)}
															</span>
														)}
													</div>
													<div
														className={`task-meta-item ${
															task.overdue
																? 'overdue'
																: ''
														}`}>
														<EventRounded fontSize='inherit' />
														<span>
															{task.dueDate ||
																'No due date'}
														</span>
													</div>
												</div>

												<div className='task-card-actions'>
													<button
														type='button'
														className='ghost-button task-action-button'
														onClick={() =>
															openEditTask(task)
														}>
														<EditRounded fontSize='small' />
														Edit
													</button>
													<button
														type='button'
														className='success-button task-action-button'
														disabled={
															busyAction ===
															`toggle:${task.id}`
														}
														onClick={() =>
															toggleTaskDone(task)
														}>
														<AssignmentTurnedInRounded fontSize='small' />
														{task.status === 'done'
															? 'Reopen'
															: 'Mark done'}
													</button>
													<button
														type='button'
														className='text-button task-action-button task-action-button-danger'
														disabled={
															busyAction ===
															`delete:${task.id}`
														}
														onClick={() =>
															deleteTask(task.id)
														}>
														<DeleteOutlineRounded fontSize='small' />
														Delete
													</button>
												</div>
											</article>
										))
									) : (
										<div className='task-column-empty'>
											No tasks in {column.label.toLowerCase()}
											.
										</div>
									)}
								</div>
							</div>
						);
					})}
				</section>
			</div>

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
