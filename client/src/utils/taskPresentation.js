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
		description: 'Internal structure work without user-facing scope change.',
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

export function getTaskTypeLabel(type) {
	const option = TASK_TYPE_OPTIONS.find((entry) => entry.value === type);
	return option?.label || 'Task';
}

export function slugifyTaskToken(value, fallback = 'general') {
	const normalized = String(value || fallback)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return normalized || fallback;
}

export function buildTaskKeyPrefix(projectName) {
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

export function buildTaskKeyPreview(tasks, projectName, editingTask = null) {
	const prefix = buildTaskKeyPrefix(projectName);
	return `${prefix}-${getNextTicketNumberPreview(tasks, projectName, editingTask)}`;
}

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

export function getProjectLabel(task) {
	return task.projectName || 'General';
}

export function getBranchActionLabel(task) {
	if (!task.projectName) {
		return 'Link project first';
	}

	if (!task.branch?.name) {
		return 'Create branch';
	}

	return task.branch.status === 'pushed' ? 'Sync branch' : 'Push branch';
}

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

