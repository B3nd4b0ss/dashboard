const {
	loadProjects,
	loadTasks,
	loadMembers,
	saveTasks,
} = require('../utils/fileOperations');
const { findProject, generateId } = require('../utils/helpers');

const TASK_STATUS_ORDER = ['backlog', 'in_progress', 'review', 'done'];
const TASK_PRIORITY_ORDER = ['low', 'medium', 'high', 'urgent'];

function normalizeOptionalText(value) {
	if (value === null || typeof value === 'undefined') {
		return null;
	}

	const trimmed = String(value).trim();
	return trimmed || null;
}

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

function getDueDateTimestamp(dueDate) {
	return dueDate
		? new Date(`${dueDate}T00:00:00`).getTime()
		: Number.MAX_SAFE_INTEGER;
}

function isTaskOverdue(task) {
	if (!task.dueDate || task.status === 'done') {
		return false;
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return getDueDateTimestamp(task.dueDate) < today.getTime();
}

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

		return (
			new Date(right.updatedAt || right.createdAt).getTime() -
			new Date(left.updatedAt || left.createdAt).getTime()
		);
	});
}

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

function decorateTask(task, members = loadMembers()) {
	return {
		...task,
		assignee:
			members.find((member) => member.id === task.assigneeId) || null,
		overdue: isTaskOverdue(task),
	};
}

function getAllTasks(filters = {}) {
	const {
		projectName = null,
		status = null,
		assigneeId = null,
		includeUnassigned = true,
	} = filters;
	const normalizedProjectName = projectName
		? normalizeProjectName(projectName)
		: null;
	const normalizedStatus = status ? normalizeTaskStatus(status) : null;
	const normalizedAssigneeId = assigneeId
		? normalizeAssigneeId(assigneeId)
		: null;
	const members = loadMembers();

	const filteredTasks = loadTasks().filter((task) => {
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

		if (!includeUnassigned && !task.assigneeId) {
			return false;
		}

		return true;
	});

	return sortTasks(filteredTasks).map((task) => decorateTask(task, members));
}

function getTaskById(id) {
	const task = loadTasks().find((entry) => entry.id === id);
	return task ? decorateTask(task) : null;
}

function getProjectTaskSummary(projectName) {
	return buildTaskSummary(
		loadTasks().filter(
			(task) =>
				task.projectName?.toLowerCase() === projectName.toLowerCase(),
		),
	);
}

function getProjectTaskSummaryMap() {
	const summaryMap = new Map();
	const tasks = loadTasks();

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

function createTask(data) {
	const title = normalizeOptionalText(data.title);
	if (!title) {
		throw new Error('Task title required');
	}

	const now = new Date().toISOString();
	const newTask = {
		id: generateId(),
		title,
		description: normalizeOptionalText(data.description),
		projectName: normalizeProjectName(data.projectName),
		status: normalizeTaskStatus(data.status),
		priority: normalizeTaskPriority(data.priority),
		assigneeId: normalizeAssigneeId(data.assigneeId),
		dueDate: normalizeDueDate(data.dueDate),
		createdAt: now,
		updatedAt: now,
	};

	const tasks = loadTasks();
	tasks.push(newTask);
	saveTasks(tasks);
	return decorateTask(newTask);
}

function updateTask(id, updates) {
	const tasks = loadTasks();
	const taskIndex = tasks.findIndex((entry) => entry.id === id);

	if (taskIndex === -1) {
		throw new Error('Task not found');
	}

	const task = tasks[taskIndex];

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

	if (Object.prototype.hasOwnProperty.call(updates, 'assigneeId')) {
		task.assigneeId = normalizeAssigneeId(updates.assigneeId);
	}

	if (Object.prototype.hasOwnProperty.call(updates, 'dueDate')) {
		task.dueDate = normalizeDueDate(updates.dueDate);
	}

	task.updatedAt = new Date().toISOString();
	tasks[taskIndex] = task;
	saveTasks(tasks);
	return decorateTask(task);
}

function deleteTask(id) {
	const tasks = loadTasks();
	const taskIndex = tasks.findIndex((entry) => entry.id === id);

	if (taskIndex === -1) {
		return false;
	}

	tasks.splice(taskIndex, 1);
	saveTasks(tasks);
	return true;
}

function renameProjectTasks(oldProjectName, newProjectName) {
	const tasks = loadTasks();
	let changed = false;

	for (const task of tasks) {
		if (task.projectName?.toLowerCase() === oldProjectName.toLowerCase()) {
			task.projectName = newProjectName;
			task.updatedAt = new Date().toISOString();
			changed = true;
		}
	}

	if (changed) {
		saveTasks(tasks);
	}
}

function deleteTasksForProject(projectName) {
	const tasks = loadTasks();
	const remainingTasks = tasks.filter(
		(task) => task.projectName?.toLowerCase() !== projectName.toLowerCase(),
	);

	if (remainingTasks.length !== tasks.length) {
		saveTasks(remainingTasks);
	}
}

function unassignTasksForMember(memberId) {
	const tasks = loadTasks();
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
	buildTaskSummary,
	getAllTasks,
	getTaskById,
	getProjectTaskSummary,
	getProjectTaskSummaryMap,
	createTask,
	updateTask,
	deleteTask,
	renameProjectTasks,
	deleteTasksForProject,
	unassignTasksForMember,
};
