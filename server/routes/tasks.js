const express = require('express');
const router = express.Router();
const taskService = require('../services/taskService');

// `GET /tasks`
// Query params: `projectName`, `status`, `assigneeId`, and `type` are optional task filters.
router.get('/', (req, res) => {
	try {
		const tasks = taskService.getAllTasks({
			projectName: req.query.projectName,
			status: req.query.status,
			assigneeId: req.query.assigneeId,
			type: req.query.type,
		});
		res.json(tasks);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// `GET /tasks/:id`
// Route params: `id` is the task id.
router.get('/:id', (req, res) => {
	const task = taskService.getTaskById(req.params.id);
	if (!task) {
		return res.status(404).json({ error: 'Task not found' });
	}

	return res.json(task);
});

// `POST /tasks`
// Body params: `title` is required. Optional params are `description`, `projectName`, `status`,
// `priority`, `type`, `assigneeId`, and `dueDate` (`YYYY-MM-DD`).
router.post('/', (req, res) => {
	try {
		const task = taskService.createTask(req.body);
		res.json(task);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// `PATCH /tasks/:id`
// Route params: `id` is the task id.
// Body params: any editable task fields from the create payload.
router.patch('/:id', (req, res) => {
	try {
		const task = taskService.updateTask(req.params.id, req.body);
		res.json(task);
	} catch (err) {
		const statusCode = err.message === 'Task not found' ? 404 : 400;
		res.status(statusCode).json({ error: err.message });
	}
});

// `POST /tasks/:id/branch`
// Route params: `id` is the task id whose linked project branch should be created or synced.
router.post('/:id/branch', async (req, res) => {
	try {
		const task = await taskService.createBranchForTask(req.params.id);
		res.json(task);
	} catch (err) {
		const statusCode = err.message === 'Task not found' ? 404 : 400;
		res.status(statusCode).json({ error: err.message });
	}
});

// `DELETE /tasks/:id`
// Route params: `id` is the task id.
router.delete('/:id', (req, res) => {
	const deleted = taskService.deleteTask(req.params.id);
	if (!deleted) {
		return res.status(404).json({ error: 'Task not found' });
	}

	return res.json({ message: 'Task deleted' });
});

module.exports = router;
