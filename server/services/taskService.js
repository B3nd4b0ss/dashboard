const {
	loadProjects,
	loadTasks,
	loadMembers,
	saveTasks,
} = require('../utils/fileOperations');
const { findProject, generateId } = require('../utils/helpers');
const { createTaskBranch } = require('./projectRepositoryService');

const TASK_STATUS_ORDER = ['backlog', 'in_progress', 'review', 'done'];
const TASK_PRIORITY_ORDER = ['low', 'medium', 'high', 'urgent'];
const TASK_TYPE_ORDER = ['task', 'feature', 'bug', 'chore', 'docs', 'refactor'];
const GENERAL_TASK_PREFIX = 'general';

/**
 * Normalizes optional text fields so empty values are stored as `null`.
 *
 * @param {unknown} value - Raw text-like value from the API payload.
 * @returns {string | null} Trimmed string or null when the value is empty.
 */
function normalizeOptionalText(value) {
	if (value === null || typeof value === 'undefined') {
		return null;
	}

	const trimmed = String(value).trim();
	return trimmed || null;
}

/**
 * Converts a task-related label into a lowercase slug segment.
 *
 * @param {unknown} value - Raw text to normalize.
 * @param {string} [fallback=GENERAL_TASK_PREFIX] - Value to use when the input is empty.
 * @returns {string} Lowercase slug used in ticket keys and branch names.
 */
function slugifyTaskToken(value, fallback = GENERAL_TASK_PREFIX) {
	const normalized = String(value || fallback)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return normalized || fallback;
}

/**
 * Builds the prefix used for task ticket keys inside one project.
 *
 * @param {string | null | undefined} projectName - Optional linked project name.
 * @returns {string} Prefix such as `general` or a slugified project name.
 */
function buildTaskKeyPrefix(projectName) {
	return slugifyTaskToken(projectName || GENERAL_TASK_PREFIX);
}

/**
 * Builds the human-facing task key shown in the UI.
 *
 * @param {string | null | undefined} projectName - Optional linked project name.
 * @param {number} ticketNumber - Numeric ticket counter within that project scope.
 * @returns {string} Ticket key such as `general-4`.
 */
function buildTaskKey(projectName, ticketNumber) {
	return `${buildTaskKeyPrefix(projectName)}-${ticketNumber}`;
}

/**
 * Validates and normalizes a task status value.
 *
 * @param {unknown} status - Raw status from the client or persisted data.
 * @returns {string} Normalized task status.
 */
function normalizeTaskStatus(status) {
	const normalizedStatus = normalizeOptionalText(status)?.toLowerCase();

	if (!normalizedStatus) {
		return 'backlog';
	}

	if (!TASK_STATUS_ORDER.includes(normalizedStatus)) {
		throw new Error(
			`Task status must be one of: ${TASK_STATUS_ORDER.join(', ')}`,
		);
	}

	return normalizedStatus;
}

/**
 * Validates and normalizes a task priority value.
 *
 * @param {unknown} priority - Raw priority from the client or persisted data.
 * @returns {string} Normalized task priority.
 */
function normalizeTaskPriority(priority) {
	const normalizedPriority = normalizeOptionalText(priority)?.toLowerCase();

	if (!normalizedPriority) {
		return 'medium';
	}

	if (!TASK_PRIORITY_ORDER.includes(normalizedPriority)) {
		throw new Error(
			`Task priority must be one of: ${TASK_PRIORITY_ORDER.join(', ')}`,
		);
	}

	return normalizedPriority;
}

/**
 * Validates and normalizes a task type value.
 *
 * @param {unknown} type - Raw type from the client or persisted data.
 * @returns {string} Normalized task type.
 */
function normalizeTaskType(type) {
	const normalizedType = normalizeOptionalText(type)?.toLowerCase();

	if (!normalizedType) {
		return 'task';
	}

	if (!TASK_TYPE_ORDER.includes(normalizedType)) {
		throw new Error(
			`Task type must be one of: ${TASK_TYPE_ORDER.join(', ')}`,
		);
	}

	return normalizedType;
}

/**
 * Safely normalizes older stored task types while falling back for unknown values.
 *
 * @param {unknown} type - Persisted task type from disk.
 * @returns {string} Supported normalized task type.
 */
function normalizeStoredTaskType(type) {
	try {
		return normalizeTaskType(type);
	} catch (error) {
		return 'task';
	}
}

/**
 * Validates a due date supplied in `YYYY-MM-DD` format.
 *
 * @param {unknown} value - Raw due date value from the client or persisted data.
 * @returns {string | null} Normalized due date, or null when no due date is set.
 */
function normalizeDueDate(value) {
	const normalizedValue = normalizeOptionalText(value);

	if (!normalizedValue) {
		return null;
	}

	if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
		throw new Error('Due date must use YYYY-MM-DD format');
	}

	const parsedDate = new Date(`${normalizedValue}T00:00:00`);
	if (Number.isNaN(parsedDate.getTime())) {
		throw new Error('Due date is invalid');
	}

	return normalizedValue;
}

/**
 * Validates a linked project name and resolves it to the persisted canonical casing.
 *
 * @param {unknown} projectName - Linked project name from the task payload.
 * @returns {string | null} Persisted project name, or null when the task is not linked to a project.
 */
function normalizeProjectName(projectName) {
	const normalizedProjectName = normalizeOptionalText(projectName);

	if (!normalizedProjectName) {
		return null;
	}

	const projects = loadProjects();
	const project = findProject(projects, normalizedProjectName);
	if (!project) {
		throw new Error('Linked project not found');
	}

	return project.name;
}

/**
 * Validates an assignee id against the current member list.
 *
 * @param {unknown} assigneeId - Member id from the task payload.
 * @returns {string | null} Persisted member id, or null when the task is unassigned.
 */
function normalizeAssigneeId(assigneeId) {
	const normalizedAssigneeId = normalizeOptionalText(assigneeId);

	if (!normalizedAssigneeId) {
		return null;
	}

	const members = loadMembers();
	const member = members.find((entry) => entry.id === normalizedAssigneeId);
	if (!member) {
		throw new Error('Assignee not found');
	}

	return member.id;
}

/**
 * Normalizes persisted branch metadata attached to a task.
 *
 * @param {object | null | undefined} branch - Raw branch metadata stored on the task.
 * @returns {object | null} Normalized branch metadata, or null when no branch is attached.
 */
function normalizeTaskBranch(branch) {
	if (!branch || typeof branch !== 'object') {
		return null;
	}

	const name = normalizeOptionalText(branch.name);
	if (!name) {
		return null;
	}

	return {
		name,
		baseBranch: normalizeOptionalText(branch.baseBranch),
		remoteName: normalizeOptionalText(branch.remoteName),
		remoteUrl: normalizeOptionalText(branch.remoteUrl),
		status:
			normalizeOptionalText(branch.status)?.toLowerCase() === 'pushed'
				? 'pushed'
				: 'local',
		createdAt: normalizeOptionalText(branch.createdAt),
		pushedAt: normalizeOptionalText(branch.pushedAt),
		lastError: normalizeOptionalText(branch.lastError),
	};
}

function getDueDateTimestamp(dueDate) {
	return dueDate
		? new Date(`${dueDate}T00:00:00`).getTime()
		: Number.MAX_SAFE_INTEGER;
}

/**
 * Determines whether a task is overdue relative to today's date.
 *
 * @param {{dueDate?: string | null, status?: string}} task - Task record to inspect.
 * @returns {boolean} True when the task has an unfinished due date in the past.
 */
function isTaskOverdue(task) {
	if (!task.dueDate || task.status === 'done') {
		return false;
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return getDueDateTimestamp(task.dueDate) < today.getTime();
}

/**
 * Sorts tasks for display by status, priority, due date, ticket number, and recency.
 *
 * @param {Array<object>} tasks - Task records to sort.
 * @returns {Array<object>} Sorted task array.
 */
function sortTasks(tasks) {
	return [...tasks].sort((left, right) => {
		const statusDelta =
			TASK_STATUS_ORDER.indexOf(left.status) -
			TASK_STATUS_ORDER.indexOf(right.status);
		if (statusDelta !== 0) {
			return statusDelta;
		}

		const priorityDelta =
			TASK_PRIORITY_ORDER.indexOf(right.priority) -
			TASK_PRIORITY_ORDER.indexOf(left.priority);
		if (priorityDelta !== 0) {
			return priorityDelta;
		}

		const dueDateDelta =
			getDueDateTimestamp(left.dueDate) -
			getDueDateTimestamp(right.dueDate);
		if (dueDateDelta !== 0) {
			return dueDateDelta;
		}

		const ticketDelta =
			Number(left.ticketNumber || 0) - Number(right.ticketNumber || 0);
		if (ticketDelta !== 0) {
			return ticketDelta;
		}

		return (
			new Date(right.updatedAt || right.createdAt).getTime() -
			new Date(left.updatedAt || left.createdAt).getTime()
		);
	});
}

/**
 * Builds aggregate counts used in project and member summaries.
 *
 * @param {Array<object>} tasks - Task records to summarize.
 * @returns {{total: number, completed: number, pending: number, backlog: number, inProgress: number, review: number, overdue: number, progressPercentage: number}} Task summary counts.
 */
function buildTaskSummary(tasks) {
	const summary = {
		total: tasks.length,
		completed: 0,
		pending: 0,
		backlog: 0,
		inProgress: 0,
		review: 0,
		overdue: 0,
		progressPercentage: 0,
	};

	for (const task of tasks) {
		if (task.status === 'done') {
			summary.completed += 1;
		} else {
			summary.pending += 1;
		}

		if (task.status === 'backlog') {
			summary.backlog += 1;
		}

		if (task.status === 'in_progress') {
			summary.inProgress += 1;
		}

		if (task.status === 'review') {
			summary.review += 1;
		}

		if (isTaskOverdue(task)) {
			summary.overdue += 1;
		}
	}

	if (summary.total > 0) {
		summary.progressPercentage = Math.round(
			(summary.completed / summary.total) * 100,
		);
	}

	return summary;
}

/**
 * Adds derived assignee and overdue information to a task record.
 *
 * @param {object} task - Persisted task record.
 * @param {Array<object>} [members=loadMembers()] - Members used to resolve the assignee.
 * @returns {object} Decorated task record for API responses.
 */
function decorateTask(task, members = loadMembers()) {
	return {
		...task,
		assignee:
			members.find((member) => member.id === task.assigneeId) || null,
		overdue: isTaskOverdue(task),
	};
}

/**
 * Finds the next available ticket number within a project scope.
 *
 * @param {Array<object>} tasks - Existing task records.
 * @param {string | null | undefined} projectName - Project name that owns the ticket sequence.
 * @param {string | null} [excludeTaskId=null] - Task id to ignore while recomputing an existing task's key.
 * @returns {number} Next available positive ticket number.
 */
function getNextTicketNumber(tasks, projectName, excludeTaskId = null) {
	const prefix = buildTaskKeyPrefix(projectName);
	const usedNumbers = new Set(
		tasks
			.filter(
				(task) =>
					task.id !== excludeTaskId &&
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

/**
 * Migrates persisted tasks so older records match the current schema and ticket rules.
 *
 * @param {Array<object>} tasks - Raw persisted tasks loaded from disk.
 * @returns {{tasks: Array<object>, changed: boolean}} Normalized tasks plus a flag describing whether they need to be saved back to disk.
 */
function normalizePersistedTasks(tasks) {
	const sourceTasks = Array.isArray(tasks) ? tasks : [];
	const normalizedTasks = [];
	const changedTasks = [];

	for (const sourceTask of sourceTasks) {
		const nextTask = {
			...sourceTask,
			description: normalizeOptionalText(sourceTask.description),
			projectName: normalizeOptionalText(sourceTask.projectName),
			status: normalizeTaskStatus(sourceTask.status),
			priority: normalizeTaskPriority(sourceTask.priority),
			type: normalizeStoredTaskType(sourceTask.type),
			assigneeId: normalizeOptionalText(sourceTask.assigneeId),
			dueDate: normalizeDueDate(sourceTask.dueDate),
			branch: normalizeTaskBranch(sourceTask.branch),
		};
		const preferredNumber = Number(sourceTask.ticketNumber);
		const preferredKey = buildTaskKey(
			nextTask.projectName,
			preferredNumber,
		);
		const hasValidPreferredNumber =
			Number.isInteger(preferredNumber) &&
			preferredNumber > 0 &&
			!normalizedTasks.some(
				(task) =>
					task.ticketKey === preferredKey &&
					task.id !== sourceTask.id,
			);
		const ticketNumber = hasValidPreferredNumber
			? preferredNumber
			: getNextTicketNumber(
					normalizedTasks,
					nextTask.projectName,
					sourceTask.id,
				);

		nextTask.ticketNumber = ticketNumber;
		nextTask.ticketKey = buildTaskKey(nextTask.projectName, ticketNumber);
		normalizedTasks.push(nextTask);

		const hasChanged =
			nextTask.description !== sourceTask.description ||
			nextTask.projectName !== sourceTask.projectName ||
			nextTask.status !== sourceTask.status ||
			nextTask.priority !== sourceTask.priority ||
			nextTask.type !== sourceTask.type ||
			nextTask.assigneeId !== sourceTask.assigneeId ||
			nextTask.dueDate !== sourceTask.dueDate ||
			nextTask.ticketNumber !== sourceTask.ticketNumber ||
			nextTask.ticketKey !== sourceTask.ticketKey ||
			JSON.stringify(nextTask.branch || null) !==
				JSON.stringify(sourceTask.branch || null);

		if (hasChanged) {
			changedTasks.push(nextTask);
		}
	}

	return {
		tasks: normalizedTasks,
		changed:
			changedTasks.length > 0 ||
			normalizedTasks.length !== sourceTasks.length,
	};
}

/**
 * Loads tasks from disk and automatically re-saves them when migration changes are detected.
 *
 * @returns {Array<object>} Normalized persisted tasks.
 */
function loadTasksWithMigration() {
	const { tasks, changed } = normalizePersistedTasks(loadTasks());
	if (changed) {
		saveTasks(tasks);
	}

	return tasks;
}

/**
 * Returns tasks filtered by project, status, assignee, or task type.
 *
 * @param {{projectName?: string | null, status?: string | null, assigneeId?: string | null, type?: string | null, includeUnassigned?: boolean}} [filters={}] - Optional task filters.
 * @returns {Array<object>} Sorted decorated tasks matching the requested filters.
 */
function getAllTasks(filters = {}) {
	const {
		projectName = null,
		status = null,
		assigneeId = null,
		type = null,
		includeUnassigned = true,
	} = filters;
	const normalizedProjectName = projectName
		? normalizeProjectName(projectName)
		: null;
	const normalizedStatus = status ? normalizeTaskStatus(status) : null;
	const normalizedAssigneeId = assigneeId
		? normalizeAssigneeId(assigneeId)
		: null;
	const normalizedType = type ? normalizeTaskType(type) : null;
	const members = loadMembers();

	const filteredTasks = loadTasksWithMigration().filter((task) => {
		if (
			normalizedProjectName &&
			task.projectName?.toLowerCase() !==
				normalizedProjectName.toLowerCase()
		) {
			return false;
		}

		if (normalizedStatus && task.status !== normalizedStatus) {
			return false;
		}

		if (normalizedAssigneeId && task.assigneeId !== normalizedAssigneeId) {
			return false;
		}

		if (normalizedType && task.type !== normalizedType) {
			return false;
		}

		if (!includeUnassigned && !task.assigneeId) {
			return false;
		}

		return true;
	});

	return sortTasks(filteredTasks).map((task) => decorateTask(task, members));
}

/**
 * Looks up a single task by id.
 *
 * @param {string} id - Task id to retrieve.
 * @returns {object | null} Decorated task record, or null when the task does not exist.
 */
function getTaskById(id) {
	const task = loadTasksWithMigration().find((entry) => entry.id === id);
	return task ? decorateTask(task) : null;
}

/**
 * Builds task summary counts for one project.
 *
 * @param {string} projectName - Project name whose tasks should be summarized.
 * @returns {object} Aggregate task summary for the project.
 */
function getProjectTaskSummary(projectName) {
	return buildTaskSummary(
		loadTasksWithMigration().filter(
			(task) =>
				task.projectName?.toLowerCase() === projectName.toLowerCase(),
		),
	);
}

/**
 * Builds a lookup map of task summaries keyed by lower-cased project name.
 *
 * @returns {Map<string, object>} Project summary map for all linked tasks.
 */
function getProjectTaskSummaryMap() {
	const summaryMap = new Map();
	const tasks = loadTasksWithMigration();

	for (const task of tasks) {
		if (!task.projectName) {
			continue;
		}

		const key = task.projectName.toLowerCase();
		if (!summaryMap.has(key)) {
			summaryMap.set(key, []);
		}

		summaryMap.get(key).push(task);
	}

	for (const [key, projectTasks] of summaryMap.entries()) {
		summaryMap.set(key, buildTaskSummary(projectTasks));
	}

	return summaryMap;
}

/**
 * Creates a new task and assigns its project-scoped ticket key.
 *
 * @param {{title: string, description?: string, projectName?: string, status?: string, priority?: string, type?: string, assigneeId?: string, dueDate?: string}} data - Task payload from the client.
 * @returns {object} Newly created decorated task.
 */
function createTask(data) {
	const title = normalizeOptionalText(data.title);
	if (!title) {
		throw new Error('Task title required');
	}

	const tasks = loadTasksWithMigration();
	const projectName = normalizeProjectName(data.projectName);
	const ticketNumber = getNextTicketNumber(tasks, projectName);
	const now = new Date().toISOString();
	const newTask = {
		id: generateId(),
		ticketNumber,
		ticketKey: buildTaskKey(projectName, ticketNumber),
		title,
		description: normalizeOptionalText(data.description),
		projectName,
		status: normalizeTaskStatus(data.status),
		priority: normalizeTaskPriority(data.priority),
		type: normalizeTaskType(data.type),
		assigneeId: normalizeAssigneeId(data.assigneeId),
		dueDate: normalizeDueDate(data.dueDate),
		branch: null,
		createdAt: now,
		updatedAt: now,
	};

	tasks.push(newTask);
	saveTasks(tasks);
	return decorateTask(newTask);
}

/**
 * Applies partial updates to an existing task.
 *
 * @param {string} id - Task id to update.
 * @param {{title?: string, description?: string, projectName?: string, status?: string, priority?: string, type?: string, assigneeId?: string, dueDate?: string}} updates - Partial task fields to overwrite.
 * @returns {object} Updated decorated task.
 */
function updateTask(id, updates) {
	const tasks = loadTasksWithMigration();
	const taskIndex = tasks.findIndex((entry) => entry.id === id);

	if (taskIndex === -1) {
		throw new Error('Task not found');
	}

	const task = tasks[taskIndex];
	const previousProjectName = task.projectName;

	if (Object.prototype.hasOwnProperty.call(updates, 'title')) {
		const normalizedTitle = normalizeOptionalText(updates.title);
		if (!normalizedTitle) {
			throw new Error('Task title required');
		}

		task.title = normalizedTitle;
	}

	if (Object.prototype.hasOwnProperty.call(updates, 'description')) {
		task.description = normalizeOptionalText(updates.description);
	}

	if (Object.prototype.hasOwnProperty.call(updates, 'projectName')) {
		task.projectName = normalizeProjectName(updates.projectName);
	}

	if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
		task.status = normalizeTaskStatus(updates.status);
	}

	if (Object.prototype.hasOwnProperty.call(updates, 'priority')) {
		task.priority = normalizeTaskPriority(updates.priority);
	}

	if (Object.prototype.hasOwnProperty.call(updates, 'type')) {
		task.type = normalizeTaskType(updates.type);
	}

	if (Object.prototype.hasOwnProperty.call(updates, 'assigneeId')) {
		task.assigneeId = normalizeAssigneeId(updates.assigneeId);
	}

	if (Object.prototype.hasOwnProperty.call(updates, 'dueDate')) {
		task.dueDate = normalizeDueDate(updates.dueDate);
	}

	if (previousProjectName !== task.projectName) {
		task.ticketNumber = getNextTicketNumber(
			tasks,
			task.projectName,
			task.id,
		);
		task.ticketKey = buildTaskKey(task.projectName, task.ticketNumber);
		task.branch = null;
	}

	task.updatedAt = new Date().toISOString();
	tasks[taskIndex] = task;
	saveTasks(tasks);
	return decorateTask(task);
}

/**
 * Creates or syncs the Git branch associated with a task's linked project.
 *
 * @param {string} id - Task id whose branch should be created.
 * @returns {Promise<object>} Updated decorated task including branch metadata.
 */
async function createBranchForTask(id) {
	const tasks = loadTasksWithMigration();
	const taskIndex = tasks.findIndex((entry) => entry.id === id);

	if (taskIndex === -1) {
		throw new Error('Task not found');
	}

	const task = tasks[taskIndex];
	if (!task.projectName) {
		throw new Error('Link this task to a project before creating a branch');
	}

	const project = findProject(loadProjects(), task.projectName);
	if (!project) {
		throw new Error('Linked project not found');
	}

	const branch = await createTaskBranch(project, task);
	task.branch = {
		name: branch.name,
		baseBranch: branch.baseBranch,
		remoteName: branch.remoteName,
		remoteUrl: branch.remoteUrl,
		status: branch.status,
		createdAt: task.branch?.createdAt || branch.createdAt,
		pushedAt: branch.pushedAt || task.branch?.pushedAt || null,
		lastError: branch.lastError || null,
	};
	task.updatedAt = new Date().toISOString();
	tasks[taskIndex] = task;
	saveTasks(tasks);
	return decorateTask(task);
}

/**
 * Deletes a task by id.
 *
 * @param {string} id - Task id to remove.
 * @returns {boolean} True when a task was deleted.
 */
function deleteTask(id) {
	const tasks = loadTasksWithMigration();
	const taskIndex = tasks.findIndex((entry) => entry.id === id);

	if (taskIndex === -1) {
		return false;
	}

	tasks.splice(taskIndex, 1);
	saveTasks(tasks);
	return true;
}

/**
 * Renames the linked project reference on all tasks belonging to a project.
 *
 * @param {string} oldProjectName - Previous project name.
 * @param {string} newProjectName - New project name.
 * @returns {void}
 */
function renameProjectTasks(oldProjectName, newProjectName) {
	const tasks = loadTasksWithMigration();
	let changed = false;

	for (const task of tasks) {
		if (task.projectName?.toLowerCase() === oldProjectName.toLowerCase()) {
			task.projectName = newProjectName;
			task.ticketKey = buildTaskKey(newProjectName, task.ticketNumber);
			task.updatedAt = new Date().toISOString();
			changed = true;
		}
	}

	if (changed) {
		saveTasks(tasks);
	}
}

/**
 * Removes every task linked to a project that is being deleted.
 *
 * @param {string} projectName - Project whose tasks should be removed.
 * @returns {void}
 */
function deleteTasksForProject(projectName) {
	const tasks = loadTasksWithMigration();
	const remainingTasks = tasks.filter(
		(task) => task.projectName?.toLowerCase() !== projectName.toLowerCase(),
	);

	if (remainingTasks.length !== tasks.length) {
		saveTasks(remainingTasks);
	}
}

/**
 * Clears the assignee from tasks belonging to a member who is being removed.
 *
 * @param {string} memberId - Member id to detach from tasks.
 * @returns {void}
 */
function unassignTasksForMember(memberId) {
	const tasks = loadTasksWithMigration();
	let changed = false;

	for (const task of tasks) {
		if (task.assigneeId === memberId) {
			task.assigneeId = null;
			task.updatedAt = new Date().toISOString();
			changed = true;
		}
	}

	if (changed) {
		saveTasks(tasks);
	}
}

module.exports = {
	TASK_STATUS_ORDER,
	TASK_PRIORITY_ORDER,
	TASK_TYPE_ORDER,
	buildTaskKey,
	buildTaskSummary,
	getAllTasks,
	getTaskById,
	getProjectTaskSummary,
	getProjectTaskSummaryMap,
	createTask,
	updateTask,
	createBranchForTask,
	deleteTask,
	renameProjectTasks,
	deleteTasksForProject,
	unassignTasksForMember,
};
