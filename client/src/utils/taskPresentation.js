export const TASK_STATUS_OPTIONS = [
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

export const PRIORITY_OPTIONS = [
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

export const TASK_TYPE_OPTIONS = [
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
		description:
			'Internal structure work without user-facing scope change.',
	},
];

export const EMPTY_TASK_FORM = {
	title: '',
	description: '',
	projectName: '',
	status: 'backlog',
	priority: 'medium',
	type: 'task',
	dueDate: '',
};

/**
 * Returns the user-facing label for a stored task status.
 *
 * @param {string | null | undefined} status - Stored task status value.
 * @returns {string} Human-readable task status.
 */
export function getTaskStatusLabel(status) {
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

/**
 * Returns the user-facing label for a stored task priority.
 *
 * @param {string | null | undefined} priority - Stored task priority value.
 * @returns {string} Human-readable task priority.
 */
export function getTaskPriorityLabel(priority) {
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

/**
 * Returns the user-facing label for a stored task type.
 *
 * @param {string | null | undefined} type - Stored task type value.
 * @returns {string} Human-readable task type.
 */
export function getTaskTypeLabel(type) {
	const option = TASK_TYPE_OPTIONS.find((entry) => entry.value === type);
	return option?.label || 'Task';
}

/**
 * Converts a task-related label into a lowercase slug segment.
 *
 * @param {unknown} value - Raw text to normalize.
 * @param {string} [fallback='general'] - Value to use when the input is empty.
 * @returns {string} Lowercase slug used in ticket keys and branch names.
 */
export function slugifyTaskToken(value, fallback = 'general') {
	const normalized = String(value || fallback)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return normalized || fallback;
}

/**
 * Builds the project-scoped prefix used in task keys.
 *
 * @param {string | null | undefined} projectName - Optional linked project name.
 * @returns {string} Prefix such as `general` or a slugified project name.
 */
export function buildTaskKeyPrefix(projectName) {
	return slugifyTaskToken(projectName || 'general');
}

/**
 * Predicts the next ticket number for a project while editing or creating a task.
 *
 * @param {Array<object>} tasks - Existing task records.
 * @param {string | null | undefined} projectName - Linked project name.
 * @param {object | null} [editingTask=null] - Current task when editing an existing record.
 * @returns {number} Next available positive ticket number.
 */
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

/**
 * Builds the preview ticket key shown in task forms.
 *
 * @param {Array<object>} tasks - Existing task records.
 * @param {string | null | undefined} projectName - Linked project name.
 * @param {object | null} [editingTask=null] - Current task when editing an existing record.
 * @returns {string} Preview ticket key such as `general-5`.
 */
export function buildTaskKeyPreview(tasks, projectName, editingTask = null) {
	const prefix = buildTaskKeyPrefix(projectName);
	return `${prefix}-${getNextTicketNumberPreview(tasks, projectName, editingTask)}`;
}

/**
 * Builds the Git branch name preview for a task.
 *
 * @param {string} type - Task type such as `feature` or `bug`.
 * @param {string} ticketKey - Task ticket key preview.
 * @param {string} title - Task title.
 * @param {string} [existingBranchName=''] - Existing branch name when one has already been created.
 * @returns {string} Preview branch name.
 */
export function buildBranchPreview(
	type,
	ticketKey,
	title,
	existingBranchName = '',
) {
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

/**
 * Returns the project label shown on task cards and forms.
 *
 * @param {object} task - Task record returned by the API.
 * @returns {string} Linked project name, or `General` for unlinked tasks.
 */
export function getProjectLabel(task) {
	return task.projectName || 'General';
}

/**
 * Returns the correct branch action label for a task's current branch state.
 *
 * @param {object} task - Task record returned by the API.
 * @returns {string} User-facing branch action label.
 */
export function getBranchActionLabel(task) {
	if (!task.projectName) {
		return 'Link project first';
	}

	if (!task.branch?.name) {
		return 'Create branch';
	}

	return task.branch.status === 'pushed' ? 'Sync branch' : 'Push branch';
}

/**
 * Returns explanatory copy for a task's current branch state.
 *
 * @param {object} task - Task record returned by the API.
 * @returns {string} User-facing branch status message.
 */
export function getBranchStatusCopy(task) {
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
