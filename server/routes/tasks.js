const express = require('express');
const taskService = require('../services/taskService');
const { validateRequest } = require('../middleware/validateRequest');
const {
	asyncHandler,
	sendData,
	sendMessage,
	sendNotFound,
} = require('../utils/httpResponses');
const {
	taskCreateBodySchema,
	taskIdParamsSchema,
	taskQuerySchema,
	taskUpdateBodySchema,
} = require('../validation/taskSchemas');

const router = express.Router();

function mapTaskError(error) {
	if (error.message === 'Task not found') {
		error.statusCode = 404;
		return error;
	}

	error.statusCode = error.statusCode || 400;
	return error;
}

// `GET /tasks`
// Query params: `projectName`, `status`, `assigneeId`, and `type` are optional task filters.
router.get(
	'/',
	validateRequest({ query: taskQuerySchema }),
	asyncHandler(async (req, res, next) => {
		try {
			const tasks = taskService.getAllTasks({
				projectName: req.query.projectName,
				status: req.query.status,
				assigneeId: req.query.assigneeId,
				type: req.query.type,
			});
			sendData(res, tasks);
		} catch (error) {
			next(mapTaskError(error));
		}
	}),
);

// `GET /tasks/:id`
// Route params: `id` is the task id.
router.get(
	'/:id',
	validateRequest({ params: taskIdParamsSchema }),
	asyncHandler(async (req, res) => {
		const task = taskService.getTaskById(req.params.id);
		if (!task) {
			sendNotFound(res, 'Task not found');
			return;
		}

		sendData(res, task);
	}),
);

// `POST /tasks`
// Body params: `title` is required. Optional params are `description`, `projectName`, `status`,
// `priority`, `type`, `assigneeId`, and `dueDate` (`YYYY-MM-DD`).
router.post(
	'/',
	validateRequest({ body: taskCreateBodySchema }),
	asyncHandler(async (req, res, next) => {
		try {
			const task = taskService.createTask(req.body);
			sendData(res, task);
		} catch (error) {
			next(mapTaskError(error));
		}
	}),
);

// `PATCH /tasks/:id`
// Route params: `id` is the task id.
// Body params: any editable task fields from the create payload.
router.patch(
	'/:id',
	validateRequest({
		params: taskIdParamsSchema,
		body: taskUpdateBodySchema,
	}),
	asyncHandler(async (req, res, next) => {
		try {
			const task = taskService.updateTask(req.params.id, req.body);
			sendData(res, task);
		} catch (error) {
			next(mapTaskError(error));
		}
	}),
);

// `POST /tasks/:id/branch`
// Route params: `id` is the task id whose linked project branch should be created or synced.
router.post(
	'/:id/branch',
	validateRequest({ params: taskIdParamsSchema }),
	asyncHandler(async (req, res, next) => {
		try {
			const task = await taskService.createBranchForTask(req.params.id);
			sendData(res, task);
		} catch (error) {
			next(mapTaskError(error));
		}
	}),
);

// `DELETE /tasks/:id`
// Route params: `id` is the task id.
router.delete(
	'/:id',
	validateRequest({ params: taskIdParamsSchema }),
	asyncHandler(async (req, res) => {
		const deleted = taskService.deleteTask(req.params.id);
		if (!deleted) {
			sendNotFound(res, 'Task not found');
			return;
		}

		sendMessage(res, 'Task deleted');
	}),
);

module.exports = router;
