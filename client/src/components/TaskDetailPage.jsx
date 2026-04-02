import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import AssignmentTurnedInRounded from '@mui/icons-material/AssignmentTurnedInRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import EventRounded from '@mui/icons-material/EventRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import HubRounded from '@mui/icons-material/HubRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import { API_BASE_URL } from '../config/api';
import TaskEditorModal from './TaskEditorModal';
import {
	EMPTY_TASK_FORM,
	buildBranchPreview,
	getBranchActionLabel,
	getBranchStatusCopy,
	getProjectLabel,
	getTaskPriorityLabel,
	getTaskStatusLabel,
	getTaskTypeLabel,
} from '../utils/taskPresentation';
import './TasksBoard.css';
import './TaskDetailPage.css';

const API = API_BASE_URL;

/**
 * Formats timestamps shown on the task detail page.
 *
 * @param {string | null | undefined} value - ISO timestamp value.
 * @returns {string} Locale-formatted date/time label.
 */
function formatTimestamp(value) {
	if (!value) {
		return 'Not available';
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return date.toLocaleString();
}

/**
 * Normalizes a task response into the editable form state used by the task detail screen.
 *
 * @param {object} task - Task record returned by the API.
 * @returns {object} Editable task form state.
 */
function buildTaskForm(task) {
	return {
		...EMPTY_TASK_FORM,
		title: task.title || '',
		description: task.description || '',
		projectName: task.projectName || '',
		status: task.status || 'new',
		priority: task.priority || 'medium',
		type: task.type || 'task',
		dueDate: task.dueDate || '',
	};
}

/**
 * Renders the task detail page for editing, linking, and branch actions.
 *
 * @returns {JSX.Element} Task detail page.
 */
function TaskDetailPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const [task, setTask] = useState(null);
	const [tasks, setTasks] = useState([]);
	const [projects, setProjects] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [pageNotice, setPageNotice] = useState('');
	const [busyAction, setBusyAction] = useState('');
	const [showEditor, setShowEditor] = useState(false);
	const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
	const [savingTask, setSavingTask] = useState(false);

	const fetchTaskData = async ({ keepLoading = false } = {}) => {
		if (!keepLoading) {
			setLoading(true);
		}

		try {
			const [taskResponse, tasksResponse, projectsResponse] =
				await Promise.all([
					axios.get(`${API}/tasks/${encodeURIComponent(id)}`),
					axios.get(`${API}/tasks`),
					axios.get(`${API}/projects`),
				]);

			setTask(taskResponse.data);
			setTaskForm(buildTaskForm(taskResponse.data));
			setTasks(tasksResponse.data);
			setProjects(projectsResponse.data);
			setError('');
		} catch (requestError) {
			setTask(null);
			setError(requestError.response?.data?.error || 'Ticket not found.');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchTaskData();
	}, [id]);

	const openEditTask = () => {
		if (!task) {
			return;
		}

		setTaskForm(buildTaskForm(task));
		setShowEditor(true);
	};

	const closeEditor = () => {
		setShowEditor(false);
		if (task) {
			setTaskForm(buildTaskForm(task));
		}
	};

	const saveTask = async () => {
		if (!taskForm.title.trim()) {
			alert('Task title required.');
			return;
		}

		setSavingTask(true);

		try {
			await axios.patch(`${API}/tasks/${id}`, {
				...taskForm,
				projectName: taskForm.projectName || null,
				assigneeId: null,
				dueDate: taskForm.dueDate || null,
			});
			setPageNotice('Ticket updated.');
			setShowEditor(false);
			await fetchTaskData({ keepLoading: true });
		} catch (requestError) {
			alert(
				requestError.response?.data?.error || 'Failed to save ticket.',
			);
		} finally {
			setSavingTask(false);
		}
	};

	const toggleTaskDone = async () => {
		if (!task) {
			return;
		}
		let nextStatus;

		switch (task.status) {
			case 'new':
				nextStatus = 'in_progress';
				break;
			case 'in_progress':
				nextStatus = 'review';
				break;
			case 'review':
				nextStatus = 'done';
				break;
			case 'done':
				nextStatus = 'in_progress';
				break;
			default:
				nextStatus = 'done';
		}

		setBusyAction('toggle');
		try {
			await axios.patch(`${API}/tasks/${id}`, {
				status: nextStatus,
			});
			switch (nextStatus) {
				case 'in_progress':
					setPageNotice('Ticket marked in progress.');
					break;
				case 'review':
					setPageNotice('Ticket marked for review.');
					break;
				case 'done':
					setPageNotice('Ticket marked done.');
					break;
				default:
					setPageNotice('Ticket status updated.');
			}
			await fetchTaskData({ keepLoading: true });
		} catch (requestError) {
			console.log(requestError.response.data.error);
			alert(
				requestError.response?.data?.error ||
					'Failed to update ticket status.',
				error,
			);
		} finally {
			setBusyAction('');
		}
	};

	const createTaskBranch = async () => {
		if (!task) {
			return;
		}

		setBusyAction('branch');

		try {
			const response = await axios.post(`${API}/tasks/${id}/branch`);
			const branch = response.data.branch;
			setPageNotice(
				branch?.lastError
					? `${branch.name} created, but push needs attention: ${branch.lastError}`
					: branch?.status === 'pushed'
						? `${branch.name} created and pushed.`
						: `${branch?.name || 'Branch'} created locally.`,
			);
			await fetchTaskData({ keepLoading: true });
		} catch (requestError) {
			alert(
				requestError.response?.data?.error ||
					'Failed to create the ticket branch.',
			);
		} finally {
			setBusyAction('');
		}
	};

	const copyBranchName = async () => {
		if (!task?.branch?.name) {
			return;
		}

		try {
			await navigator.clipboard.writeText(task.branch.name);
			setPageNotice(`Copied ${task.branch.name} to the clipboard.`);
		} catch (requestError) {
			alert('Failed to copy the branch name.');
		}
	};

	const deleteTask = async () => {
		if (!task) {
			return;
		}

		if (!window.confirm('Delete this ticket?')) {
			return;
		}

		setBusyAction('delete');

		try {
			await axios.delete(`${API}/tasks/${id}`);
			navigate('/tasks', { replace: true });
		} catch (requestError) {
			alert(
				requestError.response?.data?.error ||
					'Failed to delete ticket.',
			);
		} finally {
			setBusyAction('');
		}
	};

	if (loading) {
		return <div className='task-detail-state'>Loading ticket...</div>;
	}

	if (error || !task) {
		return (
			<div className='task-detail-state task-detail-state-error'>
				<p>{error || 'Ticket not found.'}</p>
				<Link to='/tasks' className='ghost-link'>
					Back to tickets
				</Link>
			</div>
		);
	}

	const toggleTaskActionLabel = (() => {
		switch (task.status) {
			case 'new':
				return 'Start progress';
			case 'in_progress':
				return 'Mark for review';
			case 'review':
				return 'Mark done';
			case 'done':
				return 'Reopen ticket';
			default:
				return 'Toggle status';
		}
	})();

	const branchPreview =
		task.branch?.name ||
		buildBranchPreview(task.type, task.ticketKey, task.title);

	return (
		<div className='task-detail-page'>
			<TaskEditorModal
				open={showEditor}
				onClose={closeEditor}
				onSave={saveTask}
				taskForm={taskForm}
				setTaskForm={setTaskForm}
				editingTask={task}
				projects={projects}
				tasks={tasks}
				savingTask={savingTask}
			/>

			<section className='task-detail-hero'>
				<div className='task-detail-copy'>
					<span className='section-tag'>{task.ticketKey}</span>
					<h2>{task.title}</h2>
					<p>
						{task.projectName ? (
							<>
								From{' '}
								<Link
									to={`/projects/${encodeURIComponent(task.projectName)}`}
								>
									{task.projectName}
								</Link>
							</>
						) : (
							'General ticket not linked to a project yet.'
						)}
					</p>
				</div>

				<div className='task-detail-actions'>
					<Link
						to='/tasks'
						className='ghost-button task-detail-button-link'
					>
						Back to tickets
					</Link>
					<button
						type='button'
						className='ghost-button'
						onClick={openEditTask}
					>
						<EditRounded fontSize='small' />
						Edit
					</button>
					<button
						type='button'
						className='primary-action'
						disabled={busyAction === 'toggle'}
						onClick={toggleTaskDone}
					>
						<AssignmentTurnedInRounded fontSize='small' />
						{toggleTaskActionLabel}
					</button>
				</div>
			</section>

			{pageNotice && <div className='panel-success'>{pageNotice}</div>}

			<section className='task-detail-summary'>
				<article className='task-detail-metric'>
					<span>Status</span>
					<strong>{getTaskStatusLabel(task.status)}</strong>
				</article>
				<article className='task-detail-metric'>
					<span>Priority</span>
					<strong>{getTaskPriorityLabel(task.priority)}</strong>
				</article>
				<article className='task-detail-metric'>
					<span>Type</span>
					<strong>{getTaskTypeLabel(task.type)}</strong>
				</article>
				<article
					className={`task-detail-metric ${task.overdue ? 'overdue' : ''}`}
				>
					<span>Due date</span>
					<strong>{task.dueDate || 'No due date'}</strong>
				</article>
			</section>

			<section className='task-detail-grid'>
				<article className='task-detail-card'>
					<div className='task-detail-card-head'>
						<span className='card-label'>Description</span>
						<h3>Full ticket context</h3>
					</div>
					<div className='task-detail-description'>
						{task.description || 'No description added yet.'}
					</div>
				</article>

				<article className='task-detail-card'>
					<div className='task-detail-card-head'>
						<span className='card-label'>Metadata</span>
						<h3>Ticket details</h3>
					</div>
					<div className='task-detail-info-list'>
						<div className='task-detail-info-row'>
							<span>
								<TaskAltRounded fontSize='inherit' />
								Ticket key
							</span>
							<strong>{task.ticketKey}</strong>
						</div>
						<div className='task-detail-info-row'>
							<span>
								<FolderRounded fontSize='inherit' />
								Project
							</span>
							<strong>
								{task.projectName ? (
									<Link
										to={`/projects/${encodeURIComponent(task.projectName)}`}
									>
										{getProjectLabel(task)}
									</Link>
								) : (
									getProjectLabel(task)
								)}
							</strong>
						</div>
						<div className='task-detail-info-row'>
							<span>
								<EventRounded fontSize='inherit' />
								Due date
							</span>
							<strong>{task.dueDate || 'No due date'}</strong>
						</div>
						<div className='task-detail-info-row'>
							<span>
								<ScheduleRounded fontSize='inherit' />
								Updated
							</span>
							<strong>{formatTimestamp(task.updatedAt)}</strong>
						</div>
						<div className='task-detail-info-row'>
							<span>
								<ScheduleRounded fontSize='inherit' />
								Created
							</span>
							<strong>{formatTimestamp(task.createdAt)}</strong>
						</div>
					</div>
				</article>

				<article className='task-detail-card'>
					<div className='task-detail-card-head'>
						<span className='card-label'>Branch</span>
						<h3>Git workflow</h3>
					</div>
					<div className='task-detail-branch'>
						<div className='task-detail-branch-copy'>
							<div className='task-detail-branch-heading'>
								<HubRounded fontSize='small' />
								<span>Branch name</span>
							</div>
							<strong>{branchPreview}</strong>
							<p>{getBranchStatusCopy(task)}</p>
						</div>
						<div className='task-detail-branch-actions'>
							<button
								type='button'
								className='ghost-button'
								disabled={
									!task.projectName || busyAction === 'branch'
								}
								onClick={createTaskBranch}
							>
								<HubRounded fontSize='small' />
								{busyAction === 'branch'
									? 'Working...'
									: getBranchActionLabel(task)}
							</button>
							{task.branch?.name && (
								<button
									type='button'
									className='ghost-button'
									onClick={copyBranchName}
								>
									<ContentCopyRounded fontSize='small' />
									Copy
								</button>
							)}
						</div>
					</div>
				</article>

				<article className='task-detail-card'>
					<div className='task-detail-card-head'>
						<span className='card-label'>Actions</span>
						<h3>Ticket controls</h3>
					</div>
					<div className='task-detail-control-list'>
						<button
							type='button'
							className='ghost-button'
							onClick={openEditTask}
						>
							<EditRounded fontSize='small' />
							Edit ticket
						</button>
						<button
							type='button'
							className='primary-action'
							disabled={busyAction === 'toggle'}
							onClick={toggleTaskDone}
						>
							<AssignmentTurnedInRounded fontSize='small' />
							{task.status === 'done'
								? 'Reopen ticket'
								: 'Mark as done'}
						</button>
						<button
							type='button'
							className='text-button task-detail-delete'
							disabled={busyAction === 'delete'}
							onClick={deleteTask}
						>
							<DeleteOutlineRounded fontSize='small' />
							Delete ticket
						</button>
					</div>
				</article>
			</section>
		</div>
	);
}

export default TaskDetailPage;
