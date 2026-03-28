const express = require('express');
const router = express.Router();
const projectService = require('../services/projectService');
const { readProjectRuntimeLogs } = require('../services/projectLogService');
const { startProject, stopProject } = require('../services/projectLifecycle');
const {
	listProjectFiles,
	readProjectFile,
	saveProjectFile,
	createProjectEntry,
	deleteProjectEntry,
} = require('../services/projectFileService');
const {
	runProjectCommand,
	runProjectPreset,
	getProjectExecution,
	stopProjectExecution,
} = require('../services/projectTerminalService');

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

// Get project runtime logs
router.get('/:name/logs', async (req, res) => {
	try {
		const logs = await readProjectRuntimeLogs(req.params.name, {
			serviceName: req.query.service || null,
			lineLimit: req.query.limit,
		});
		res.json(logs);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Get project file tree
router.get('/:name/files', async (req, res) => {
	try {
		const workspace = await listProjectFiles(req.params.name);
		res.json(workspace);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Read a project file
router.get('/:name/files/content', async (req, res) => {
	try {
		const file = await readProjectFile(req.params.name, req.query.path);
		res.json(file);
	} catch (err) {
		const statusCode =
			err.code === 'ENOENT' || err.code === 'ENOTDIR' ? 404 : 400;
		res.status(statusCode).json({ error: err.message });
	}
});

// Create a file or folder inside a project
router.post('/:name/files', async (req, res) => {
	try {
		const entry = await createProjectEntry(
			req.params.name,
			req.body.path,
			req.body.type,
		);
		res.json(entry);
	} catch (err) {
		const statusCode = err.code === 'EEXIST' ? 409 : 400;
		res.status(statusCode).json({ error: err.message });
	}
});

// Save a project file
router.put('/:name/files/content', async (req, res) => {
	try {
		const file = await saveProjectFile(
			req.params.name,
			req.body.path,
			req.body.content,
		);
		res.json(file);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Delete a file or folder inside a project
router.delete('/:name/files', async (req, res) => {
	try {
		const entry = await deleteProjectEntry(req.params.name, req.query.path);
		res.json(entry);
	} catch (err) {
		const statusCode =
			err.code === 'ENOENT' || err.code === 'ENOTDIR' ? 404 : 400;
		res.status(statusCode).json({ error: err.message });
	}
});

// Execute a project terminal command
router.post('/:name/terminal/execute', async (req, res) => {
	try {
		const execution = runProjectCommand(req.params.name, req.body.command, {
			cwd: req.body.cwd,
			label: req.body.label,
		});
		res.json(execution);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Execute a command preset
router.post('/:name/terminal/presets/:presetId', async (req, res) => {
	try {
		const execution = runProjectPreset(req.params.name, req.params.presetId);
		res.json(execution);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Read a terminal execution snapshot
router.get('/:name/terminal/:executionId', async (req, res) => {
	try {
		const execution = getProjectExecution(
			req.params.name,
			req.params.executionId,
		);
		res.json(execution);
	} catch (err) {
		res.status(404).json({ error: err.message });
	}
});

// Stop a terminal execution
router.post('/:name/terminal/:executionId/stop', async (req, res) => {
	try {
		const execution = await stopProjectExecution(
			req.params.name,
			req.params.executionId,
		);
		res.json(execution);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
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
