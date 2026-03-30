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

// `GET /projects`
// Returns every project decorated with runtime, monitoring, and task summary data.
router.get('/', async (req, res) => {
	try {
		const projects = await projectService.getAllProjects();
		res.json(projects);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// `GET /projects/:name`
// Route params: `name` is the persisted project name.
router.get('/:name', async (req, res) => {
	const project = await projectService.getProject(req.params.name);
	if (!project) return res.sendStatus(404);
	res.json(project);
});

// `GET /projects/:name/logs`
// Route params: `name` is the persisted project name.
// Query params: `service` optionally limits logs to `frontend` or `backend`; `limit` controls the recent line count.
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

// `GET /projects/:name/files`
// Route params: `name` is the persisted project name.
// Returns the file tree used by the inline project editor.
router.get('/:name/files', async (req, res) => {
	try {
		const workspace = await listProjectFiles(req.params.name);
		res.json(workspace);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// `GET /projects/:name/files/content`
// Route params: `name` is the persisted project name.
// Query params: `path` is the required project-relative file path to open.
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

// `POST /projects/:name/files`
// Route params: `name` is the persisted project name.
// Body params: `path` is required and project-relative; `type` may be `file` or `directory`.
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

// `PUT /projects/:name/files/content`
// Route params: `name` is the persisted project name.
// Body params: `path` is required and project-relative; `content` is the UTF-8 file content to save.
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

// `DELETE /projects/:name/files`
// Route params: `name` is the persisted project name.
// Query params: `path` is the required project-relative file or folder path to delete.
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

// `POST /projects/:name/terminal/execute`
// Route params: `name` is the persisted project name.
// Body params: `command` is required; `cwd` is an optional project-relative working directory; `label` customizes the execution title.
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

// `POST /projects/:name/terminal/presets/:presetId`
// Route params: `name` is the persisted project name; `presetId` is one of the ids returned in `commandPresets`.
router.post('/:name/terminal/presets/:presetId', async (req, res) => {
	try {
		const execution = runProjectPreset(
			req.params.name,
			req.params.presetId,
		);
		res.json(execution);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// `GET /projects/:name/terminal/:executionId`
// Route params: `name` is the persisted project name; `executionId` is returned when a command starts.
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

// `POST /projects/:name/terminal/:executionId/stop`
// Route params: `name` is the persisted project name; `executionId` identifies the running command to stop.
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

// `POST /projects`
// Body params: `name` is required. Optional params include `frontend`, `backend`, `databaseId`,
// `frontendPort`, `backendPort`, `projectLocation`, `autoCreateRepo`, and `visibility`.
router.post('/', async (req, res) => {
	try {
		const project = await projectService.createProject(req.body);
		res.json(project);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// `PATCH /projects/:name`
// Route params: `name` is the existing project name.
// Body params: any editable project fields such as `name`, `frontendPort`, `backendPort`, `databaseId`,
// `projectLocation`, or scaffold metadata (`description`, `version`, `projectSlug`, Java settings, or nested `scaffold`).
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

// `POST /projects/:name/publish`
// Route params: `name` is the local-only project to publish to GitHub.
router.post('/:name/publish', async (req, res) => {
	try {
		const project = await projectService.publishProject(req.params.name);
		res.json(project);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// `POST /projects/:name/start`
// Route params: `name` is the persisted project name.
router.post('/:name/start', async (req, res) => {
	try {
		const result = await startProject(req.params.name);
		res.json(result);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// `POST /projects/:name/stop`
// Route params: `name` is the persisted project name.
router.post('/:name/stop', async (req, res) => {
	try {
		const result = await stopProject(req.params.name);
		res.json(result);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// `DELETE /projects/:name/delete`
// Route params: `name` is the persisted project name.
// Query params: `deleteRemote=true` also deletes the linked remote repository when available.
router.delete('/:name/delete', async (req, res) => {
	try {
		await projectService.deleteProject(req.params.name, {
			deleteRemote: req.query.deleteRemote === 'true',
		});
		res.json({ message: 'Project deleted' });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// `POST /projects/create-stream`
// Body params match `POST /projects`, but progress is returned over an SSE stream as `log`, `error`, and `complete` events.
router.post('/create-stream', async (req, res) => {
	// Keep the HTTP connection open so the client can receive progress events during project creation.
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
