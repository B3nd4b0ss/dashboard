import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import AssignmentTurnedInRounded from '@mui/icons-material/AssignmentTurnedInRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import EventRounded from '@mui/icons-material/EventRounded';
import FilterListRounded from '@mui/icons-material/FilterListRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import HubRounded from '@mui/icons-material/HubRounded';
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
const TASK_TYPE_OPTIONS = [
	{
		value: 'task',
		label: 'Task',
		description: 'General implementation or follow-up work.',
	},
	{
		value: 'feature',
		label: 'Feature',
		description: 'A user-facing improvement or product addition.',
	},
	{
		value: 'bug',
		label: 'Bug',
		description: 'A defect, regression, or broken behavior to fix.',
	},
	{
		value: 'chore',
		label: 'Chore',
		description: 'Maintenance, setup, or operational cleanup.',
	},
	{
		value: 'docs',
		label: 'Docs',
		description: 'Documentation changes and content updates.',
	},
	{
		value: 'refactor',
		label: 'Refactor',
		description: 'Internal structure work without user-facing scope change.',
	},
];
const EMPTY_TASK_FORM = {
	title: '',
	description: '',
	projectName: '',
	status: 'backlog',
	priority: 'medium',
	type: 'task',
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

function getTaskTypeLabel(type) {
	const option = TASK_TYPE_OPTIONS.find((entry) => entry.value === type);
	return option?.label || 'Task';
}

function slugifyTaskToken(value, fallback = 'general') {
	const normalized = String(value || fallback)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return normalized || fallback;
}

function buildTaskKeyPrefix(projectName) {
	return slugifyTaskToken(projectName || 'general');
}

function getNextTicketNumberPreview(tasks, projectName, editingTask = null) {
	const prefix = buildTaskKeyPrefix(projectName);
	if (
		editingTask &&
		buildTaskKeyPrefix(editingTask.projectName) === prefix &&
		Number.isInteger(Number(editingTask.ticketNumber))
	) {
		return Number(editingTask.ticketNumber);
	}

	const usedNumbers = new Set(
		tasks
			.filter(
				(task) =>
					task.id !== editingTask?.id &&
					buildTaskKeyPrefix(task.projectName) === prefix,
			)
			.map((task) => Number(task.ticketNumber))
			.filter((value) => Number.isInteger(value) && value > 0),
	);
	let nextNumber = 1;

	while (usedNumbers.has(nextNumber)) {
		nextNumber += 1;
	}

	return nextNumber;
}

function buildTaskKeyPreview(tasks, projectName, editingTask = null) {
	const prefix = buildTaskKeyPrefix(projectName);
	return `${prefix}-${getNextTicketNumberPreview(tasks, projectName, editingTask)}`;
}

function buildBranchPreview(type, ticketKey, title, existingBranchName = '') {
	if (existingBranchName) {
		return existingBranchName;
	}

	const typeSegment = slugifyTaskToken(type || 'task', 'task');
	const keySegment = slugifyTaskToken(ticketKey || 'task', 'task');
	const titleSegment = slugifyTaskToken(title || '', '');

	return titleSegment
		? `${typeSegment}/${keySegment}-${titleSegment}`
		: `${typeSegment}/${keySegment}`;
}

function getProjectLabel(task) {
	return task.projectName || 'General';
}

function getBranchActionLabel(task) {
	if (!task.projectName) {
		return 'Link project first';
	}

	if (!task.branch?.name) {
		return 'Create branch';
	}

	return task.branch.status === 'pushed' ? 'Sync branch' : 'Push branch';
}

function getBranchStatusCopy(task) {
	if (!task.projectName) {
		return 'Link the task to a project before creating its branch.';
	}

	if (!task.branch?.name) {
		return 'No branch yet. Create one when you start the task.';
	}

	if (task.branch.lastError) {
		return `Branch exists locally. Push needs attention: ${task.branch.lastError}`;
	}

	return task.branch.status === 'pushed'
		? 'Branch exists locally and on origin.'
		: 'Branch exists locally.';
}

function TasksBoard() {
	const [searchParams, setSearchParams] = useSearchParams();
	const initialProjectFilter = searchParams.get('project') || 'all';
	const [tasks, setTasks] = useState([]);
	const [projects, setProjects] = useState([]);
	const query = getSearchParamValue(searchParams, 'q');
	const [projectFilter, setProjectFilter] = useState(initialProjectFilter);
	const [priorityFilter, setPriorityFilter] = useState('all');
	const [typeFilter, setTypeFilter] = useState('all');
	const [showEditor, setShowEditor] = useState(false);
	const [editingTask, setEditingTask] = useState(null);
	const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
	const [pageError, setPageError] = useState('');
	const [pageNotice, setPageNotice] = useState('');
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
			type: task.type || 'task',
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
				setPageNotice('Task updated.');
			} else {
				await axios.post(`${API}/tasks`, payload);
				setPageNotice('Task created.');
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
			setPageNotice('Task deleted.');
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
			setPageNotice(
				nextStatus === 'done' ? 'Task marked done.' : 'Task reopened.',
			);
			await refreshBoard();
		} catch (error) {
			alert(error.response?.data?.error || 'Failed to update task.');
		} finally {
			setBusyAction('');
		}
	};

	const createTaskBranch = async (task) => {
		setBusyAction(`branch:${task.id}`);

		try {
			const response = await axios.post(`${API}/tasks/${task.id}/branch`);
			const updatedTask = response.data;
			const branch = updatedTask.branch;
			setPageNotice(
				branch?.lastError
					? `${branch.name} created, but push needs attention: ${branch.lastError}`
					: branch?.status === 'pushed'
						? `${branch.name} created and pushed.`
						: `${branch?.name || 'Branch'} created locally.`,
			);
			await refreshBoard();
		} catch (error) {
			alert(
				error.response?.data?.error || 'Failed to create task branch.',
			);
		} finally {
			setBusyAction('');
		}
	};

	const copyBranchName = async (branchName) => {
		if (!branchName) {
			return;
		}

		try {
			await navigator.clipboard.writeText(branchName);
			setPageNotice(`Copied ${branchName} to the clipboard.`);
		} catch (error) {
			alert('Failed to copy the branch name.');
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
			task.ticketKey,
			task.title,
			task.description,
			task.projectName,
			task.priority,
			task.type,
			task.branch?.name,
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
		const matchesType =
			typeFilter === 'all' || task.type === typeFilter;

		return matchesQuery && matchesProject && matchesPriority && matchesType;
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
			description: `${project.taskSummary?.total || 0} tracked tasks`,
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
	const typeFilterOptions = [
		{
			value: 'all',
			label: 'All types',
			description: 'Show every ticket type.',
		},
		...TASK_TYPE_OPTIONS,
	];
	const ticketKeyPreview = buildTaskKeyPreview(
		tasks,
		taskForm.projectName,
		editingTask,
	);
	const branchPreview = buildBranchPreview(
		taskForm.type,
		ticketKeyPreview,
		taskForm.title,
		editingTask?.branch?.name || '',
	);

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
									Ticket Editor
								</span>
								<h3>
									{editingTask ? 'Edit ticket' : 'Create ticket'}
								</h3>
								<p>
									Each ticket gets its own key, type, and
									branch-ready naming so you can move from
									planning into Git without extra setup.
								</p>
							</div>
							<button
								type='button'
								className='ghost-button'
								onClick={closeEditor}>
								Close
							</button>
						</div>

						<div className='task-ticket-preview-grid'>
							<div className='task-ticket-preview-card'>
								<span>Ticket key</span>
								<strong>{editingTask?.ticketKey || ticketKeyPreview}</strong>
								<p>
									{taskForm.projectName
										? 'Uses the linked project name as the ticket prefix.'
										: 'General tickets stay unlinked until you attach them to a project.'}
								</p>
							</div>
							<div className='task-ticket-preview-card'>
								<span>Branch preview</span>
								<strong>{branchPreview}</strong>
								<p>
									{taskForm.projectName
										? 'Creating a branch from this ticket will use this path automatically.'
										: 'Link a project if you want the dashboard to create a real Git branch for this ticket.'}
								</p>
							</div>
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
									placeholder='Summarize the work in one clear line'
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
									rows={7}
									placeholder='Add context, expected behavior, acceptance notes, or implementation details.'
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
								<span>Type</span>
								<SurfaceSelect
									value={taskForm.type}
									onChange={(nextValue) =>
										setTaskForm((previous) => ({
											...previous,
											type: nextValue,
										}))
									}
									options={TASK_TYPE_OPTIONS}
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
										? 'Save ticket'
										: 'Create ticket'}
							</button>
						</div>
					</div>
				</div>
			)}

			<section className='tasks-hero'>
				<div className='tasks-hero-copy'>
					<span className='section-tag'>Ticketing</span>
					<h2>
						Track project work with ticket keys, task types, and Git-ready branches.
					</h2>
					<p>
						Every ticket can now follow a project-style key like
						<code> project-name-1</code>, carry a clear type such as
						feature or bug, and generate a matching branch when you
						are ready to work on it.
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
						placeholder='Search ticket keys, titles, descriptions, projects, or branch names'
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
							value={typeFilter}
							onChange={setTypeFilter}
							options={typeFilterOptions}
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
											<p>{columnTasks.length} tickets</p>
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
													<div className='task-ticket-row'>
														<span className='task-ticket-key'>
															{task.ticketKey}
														</span>
														<span
															className={`task-type-pill type-${task.type}`}>
															{getTaskTypeLabel(task.type)}
														</span>
														<span
															className={`task-priority-pill priority-${task.priority}`}>
															{getPriorityLabel(task.priority)}
														</span>
													</div>
													<div className='task-card-copy'>
														<h3>{task.title}</h3>
													</div>
												</div>

												{task.description && (
													<p className='task-card-description'>
														{task.description}
													</p>
												)}

												<div className='task-meta-grid'>
													<div className='task-meta-panel'>
														<span>Project</span>
														<strong>
															{task.projectName ? (
																<Link
																	to={`/projects/${encodeURIComponent(
																		task.projectName,
																	)}`}>
																	{getProjectLabel(task)}
																</Link>
															) : (
																getProjectLabel(task)
															)}
														</strong>
													</div>
													<div
														className={`task-meta-panel ${
															task.overdue ? 'overdue' : ''
														}`}>
														<span>Due date</span>
														<strong>
															{task.dueDate || 'No due date'}
														</strong>
													</div>
												</div>

												<div className='task-branch-strip'>
													<div className='task-branch-copy'>
														<div className='task-branch-heading'>
															<HubRounded fontSize='small' />
															<span>Git branch</span>
														</div>
														<strong>
															{task.branch?.name ||
																buildBranchPreview(
																	task.type,
																	task.ticketKey,
																	task.title,
																)}
														</strong>
														<p>{getBranchStatusCopy(task)}</p>
													</div>
													<div className='task-branch-actions'>
														<button
															type='button'
															className='ghost-button task-action-button'
															disabled={
																!task.projectName ||
																busyAction === `branch:${task.id}`
															}
															onClick={() =>
																createTaskBranch(task)
															}>
															<HubRounded fontSize='small' />
															{busyAction === `branch:${task.id}`
																? 'Working...'
																: getBranchActionLabel(task)}
														</button>
														{task.branch?.name && (
															<button
																type='button'
																className='ghost-button task-action-button'
																onClick={() =>
																	copyBranchName(
																		task.branch.name,
																	)
																}>
																<ContentCopyRounded fontSize='small' />
																Copy
															</button>
														)}
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
															busyAction === `toggle:${task.id}`
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
															busyAction === `delete:${task.id}`
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
											No tickets in {column.label.toLowerCase()}.
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
