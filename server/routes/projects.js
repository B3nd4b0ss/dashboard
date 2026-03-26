const express = require('express');
const router = express.Router();
const projectService = require('../services/projectService');
const { startProject, stopProject } = require('../services/projectLifecycle');

// Get all projects
router.get('/', async (req, res) => {
	try {
		const projects = await projectService.getAllProjects();
		res.json(projects);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Get single project
router.get('/:name', async (req, res) => {
	const project = await projectService.getProject(req.params.name);
	if (!project) return res.sendStatus(404);
	res.json(project);
});

// Create project
router.post('/', async (req, res) => {
	try {
		const project = await projectService.createProject(req.body);
		res.json(project);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Update project
router.patch('/:name', async (req, res) => {
	try {
		const project = await projectService.updateProject(
			req.params.name,
			req.body,
		);
		res.json(project);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Start project
router.post('/:name/start', async (req, res) => {
	try {
		const result = await startProject(req.params.name);
		res.json(result);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Stop project
router.post('/:name/stop', async (req, res) => {
	try {
		const result = await stopProject(req.params.name);
		res.json(result);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Delete project
router.delete('/:name/delete', async (req, res) => {
	try {
		await projectService.deleteProject(req.params.name);
		res.json({ message: 'Project deleted' });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Add this route for streaming creation
router.post('/create-stream', async (req, res) => {
	// Set headers for SSE
	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive',
	});
	res.flushHeaders();

	const eventEmitter = new (require('events').EventEmitter)();

	eventEmitter.on('log', (message) => {
		res.write(`data: ${JSON.stringify({ type: 'log', message })}\n\n`);
	});

	eventEmitter.on('error', (message) => {
		res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
		res.end();
	});

	eventEmitter.on('complete', (project) => {
		res.write(`data: ${JSON.stringify({ type: 'complete', project })}\n\n`);
		res.end();
	});

	try {
		await projectService.createProjectWithStream(req.body, eventEmitter);
	} catch (err) {
		eventEmitter.emit('error', err.message);
	}
});

module.exports = router;
