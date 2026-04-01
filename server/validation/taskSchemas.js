const { z } = require('zod');
const {
	TASK_PRIORITY_ORDER,
	TASK_STATUS_ORDER,
	TASK_TYPE_ORDER,
} = require('../services/taskService');
const {
	optionalEnumString,
	optionalTrimmedString,
	requiredTrimmedString,
} = require('./common');

const taskIdParamsSchema = z.object({
	id: requiredTrimmedString('Task id', 120),
});

const taskQuerySchema = z.object({
	projectName: optionalTrimmedString('Project name', 120),
	status: optionalEnumString(TASK_STATUS_ORDER, 'Task status'),
	assigneeId: optionalTrimmedString('Assignee id', 120),
	type: optionalEnumString(TASK_TYPE_ORDER, 'Task type'),
});

const taskCreateBodySchema = z
	.object({
		title: requiredTrimmedString('Task title', 200),
		description: z
			.union([z.string().trim().max(5000), z.literal(''), z.null()])
			.optional(),
		projectName: z
			.union([z.string().trim().max(120), z.literal(''), z.null()])
			.optional(),
		status: optionalEnumString(TASK_STATUS_ORDER, 'Task status'),
		priority: optionalEnumString(TASK_PRIORITY_ORDER, 'Task priority'),
		type: optionalEnumString(TASK_TYPE_ORDER, 'Task type'),
		assigneeId: z
			.union([z.string().trim().max(120), z.literal(''), z.null()])
			.optional(),
		dueDate: z
			.union([
				z
					.string()
					.trim()
					.regex(
						/^\d{4}-\d{2}-\d{2}$/,
						'Due date must use YYYY-MM-DD format',
					),
				z.literal(''),
				z.null(),
			])
			.optional(),
	})
	.strict();

const taskUpdateBodySchema = taskCreateBodySchema
	.partial()
	.refine((payload) => Object.keys(payload).length > 0, {
		message: 'At least one task field must be provided',
		path: ['body'],
	});

module.exports = {
	taskCreateBodySchema,
	taskIdParamsSchema,
	taskQuerySchema,
	taskUpdateBodySchema,
};
