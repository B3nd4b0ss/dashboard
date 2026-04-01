const express = require('express');
const { EventEmitter } = require('events');
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
	getProjectCommandHistory,
	clearProjectCommandHistory,
	stopProjectExecution,
} = require('../services/projectTerminalService');
const { validateRequest } = require('../middleware/validateRequest');
const {
	asyncHandler,
	sendData,
	sendMessage,
	sendNotFound,
} = require('../utils/httpResponses');
const {
	projectCommandBodySchema,
	projectCreateBodySchema,
	projectDeleteQuerySchema,
	projectEntryBodySchema,
	projectExecutionParamsSchema,
	projectFilePathQuerySchema,
	projectFileSaveBodySchema,
	projectHistoryQuerySchema,
	projectLogsQuerySchema,
	projectNameParamsSchema,
	projectPresetParamsSchema,
	projectUpdateBodySchema,
} = require('../validation/projectSchemas');

const router = express.Router();

function withStatus(error, statusCode) {
	if (!error.statusCode) {
		error.statusCode = statusCode;
	}

	return error;
}

function mapProjectServiceError(error) {
	switch (error.message) {
		case 'Project not found':
		case 'Database not found':
			return withStatus(error, 404);
		case 'Name exists':
		case 'Name already exists':
		case 'Project folder already exists':
		case 'Destination project folder already exists':
			return withStatus(error, 409);
		default:
			return withStatus(error, 400);
	}
}

function mapWorkspaceError(error) {
	if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
		return withStatus(error, 404);
	}

	if (error.code === 'EEXIST') {
		return withStatus(error, 409);
	}

	if (error.message === 'Project not found') {
		return withStatus(error, 404);
	}

	return withStatus(error, 400);
}

function mapTerminalError(error) {
	if (
		error.message === 'Project not found' ||
		error.message === 'Command preset not found' ||
		error.message === 'Terminal execution not found'
	) {
		return withStatus(error, 404);
	}

	return withStatus(error, error.statusCode || 400);
}

// `GET /projects`
// Returns every project decorated with runtime, monitoring, and task summary data.
router.get(
	'/',
	asyncHandler(async (req, res) => {
		const projects = await projectService.getAllProjects();
		sendData(res, projects);
	}),
);

// `POST /projects`
// Body params: `name` is required. Optional params include `frontend`, `backend`, `databaseId`,
// `frontendPort`, `backendPort`, `projectLocation`, `autoCreateRepo`, and `visibility`.
router.post(
	'/',
	validateRequest({ body: projectCreateBodySchema }),
	asyncHandler(async (req, res, next) => {
		try {
			const project = await projectService.createProject(req.body);
			sendData(res, project);
		} catch (error) {
			next(mapProjectServiceError(error));
		}
	}),
);

// `POST /projects/create-stream`
// Body params match `POST /projects`, but progress is returned over an SSE stream as `log`, `error`, and `complete` events.
router.post(
	'/create-stream',
	validateRequest({ body: projectCreateBodySchema }),
	asyncHandler(async (req, res) => {
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		});
		res.flushHeaders();

		const eventEmitter = new EventEmitter();

		eventEmitter.on('log', (message) => {
			res.write(`data: ${JSON.stringify({ type: 'log', message })}\n\n`);
		});

		eventEmitter.on('error', (message) => {
			res.write(
				`data: ${JSON.stringify({ type: 'error', message })}\n\n`,
			);
			res.end();
		});

		eventEmitter.on('complete', (project) => {
			res.write(
				`data: ${JSON.stringify({ type: 'complete', project })}\n\n`,
			);
			res.end();
		});

		try {
			await projectService.createProjectWithStream(
				req.body,
				eventEmitter,
			);
		} catch (error) {
			eventEmitter.emit('error', mapProjectServiceError(error).message);
		}
	}),
);

// `GET /projects/:name`
// Route params: `name` is the persisted project name.
router.get(
	'/:name',
	validateRequest({ params: projectNameParamsSchema }),
	asyncHandler(async (req, res) => {
		const project = await projectService.getProject(req.params.name);
		if (!project) {
			sendNotFound(res, 'Project not found');
			return;
		}

		sendData(res, project);
	}),
);

// `PATCH /projects/:name`
// Route params: `name` is the existing project name.
// Body params: any editable project fields such as `name`, `frontendPort`, `backendPort`, `databaseId`,
// `projectLocation`, or scaffold metadata (`description`, `version`, `projectSlug`, Java settings, or nested `scaffold`).
router.patch(
	'/:name',
	validateRequest({
		params: projectNameParamsSchema,
		body: projectUpdateBodySchema,
	}),
	asyncHandler(async (req, res, next) => {
		try {
			const project = await projectService.updateProject(
				req.params.name,
				req.body,
			);
			sendData(res, project);
		} catch (error) {
			next(mapProjectServiceError(error));
		}
	}),
);

// `DELETE /projects/:name/delete`
// Route params: `name` is the persisted project name.
// Query params: `deleteRemote=true` also deletes the linked remote repository when available.
router.delete(
	'/:name/delete',
	validateRequest({
		params: projectNameParamsSchema,
		query: projectDeleteQuerySchema,
	}),
	asyncHandler(async (req, res, next) => {
		try {
			await projectService.deleteProject(req.params.name, {
				deleteRemote: req.query.deleteRemote,
			});
			sendMessage(res, 'Project deleted');
		} catch (error) {
			next(mapProjectServiceError(error));
		}
	}),
);

// `POST /projects/:name/publish`
// Route params: `name` is the local-only project to publish to GitHub.
router.post(
	'/:name/publish',
	validateRequest({ params: projectNameParamsSchema }),
	asyncHandler(async (req, res, next) => {
		try {
			const project = await projectService.publishProject(
				req.params.name,
			);
			sendData(res, project);
		} catch (error) {
			next(mapProjectServiceError(error));
		}
	}),
);

// `POST /projects/:name/start`
// Route params: `name` is the persisted project name.
router.post(
	'/:name/start',
	validateRequest({ params: projectNameParamsSchema }),
	asyncHandler(async (req, res, next) => {
		try {
			const result = await startProject(req.params.name);
			sendData(res, result);
		} catch (error) {
			next(mapProjectServiceError(error));
		}
	}),
);

// `POST /projects/:name/stop`
// Route params: `name` is the persisted project name.
router.post(
	'/:name/stop',
	validateRequest({ params: projectNameParamsSchema }),
	asyncHandler(async (req, res, next) => {
		try {
			const result = await stopProject(req.params.name);
			sendData(res, result);
		} catch (error) {
			next(mapProjectServiceError(error));
		}
	}),
);

// `GET /projects/:name/logs`
// Route params: `name` is the persisted project name.
// Query params: `service` optionally limits logs to `frontend` or `backend`; `limit` controls the recent line count.
router.get(
	'/:name/logs',
	validateRequest({
		params: projectNameParamsSchema,
		query: projectLogsQuerySchema,
	}),
	asyncHandler(async (req, res, next) => {
		try {
			const logs = await readProjectRuntimeLogs(req.params.name, {
				serviceName: req.query.service || null,
				lineLimit: req.query.limit,
			});
			sendData(res, logs);
		} catch (error) {
			next(mapWorkspaceError(error));
		}
	}),
);

// `GET /projects/:name/files`
// Route params: `name` is the persisted project name.
// Returns the file tree used by the inline project editor.
router.get(
	'/:name/files',
	validateRequest({ params: projectNameParamsSchema }),
	asyncHandler(async (req, res, next) => {
		try {
			const workspace = await listProjectFiles(req.params.name);
			sendData(res, workspace);
		} catch (error) {
			next(mapWorkspaceError(error));
		}
	}),
);

// `GET /projects/:name/files/content`
// Route params: `name` is the persisted project name.
// Query params: `path` is the required project-relative file path to open.
router.get(
	'/:name/files/content',
	validateRequest({
		params: projectNameParamsSchema,
		query: projectFilePathQuerySchema,
	}),
	asyncHandler(async (req, res, next) => {
		try {
			const file = await readProjectFile(req.params.name, req.query.path);
			sendData(res, file);
		} catch (error) {
			next(mapWorkspaceError(error));
		}
	}),
);

// `POST /projects/:name/files`
// Route params: `name` is the persisted project name.
// Body params: `path` is required and project-relative; `type` may be `file` or `directory`.
router.post(
	'/:name/files',
	validateRequest({
		params: projectNameParamsSchema,
		body: projectEntryBodySchema,
	}),
	asyncHandler(async (req, res, next) => {
		try {
			const entry = await createProjectEntry(
				req.params.name,
				req.body.path,
				req.body.type,
			);
			sendData(res, entry);
		} catch (error) {
			next(mapWorkspaceError(error));
		}
	}),
);

// `PUT /projects/:name/files/content`
// Route params: `name` is the persisted project name.
// Body params: `path` is required and project-relative; `content` is the UTF-8 file content to save.
router.put(
	'/:name/files/content',
	validateRequest({
		params: projectNameParamsSchema,
		body: projectFileSaveBodySchema,
	}),
	asyncHandler(async (req, res, next) => {
		try {
			const file = await saveProjectFile(
				req.params.name,
				req.body.path,
				req.body.content,
			);
			sendData(res, file);
		} catch (error) {
			next(mapWorkspaceError(error));
		}
	}),
);

// `DELETE /projects/:name/files`
// Route params: `name` is the persisted project name.
// Query params: `path` is the required project-relative file or folder path to delete.
router.delete(
	'/:name/files',
	validateRequest({
		params: projectNameParamsSchema,
		query: projectFilePathQuerySchema,
	}),
	asyncHandler(async (req, res, next) => {
		try {
			const entry = await deleteProjectEntry(
				req.params.name,
				req.query.path,
			);
			sendData(res, entry);
		} catch (error) {
			next(mapWorkspaceError(error));
		}
	}),
);

// `POST /projects/:name/terminal/execute`
// Route params: `name` is the persisted project name.
// Body params: `command` is required; `cwd` is an optional project-relative working directory; `label` customizes the execution title.
router.post(
	'/:name/terminal/execute',
	validateRequest({
		params: projectNameParamsSchema,
		body: projectCommandBodySchema,
	}),
	asyncHandler(async (req, res, next) => {
		try {
			const execution = runProjectCommand(
				req.params.name,
				req.body.command,
				{
					cwd: req.body.cwd,
					label: req.body.label,
				},
			);
			sendData(res, execution);
		} catch (error) {
			next(mapTerminalError(error));
		}
	}),
);

// `POST /projects/:name/terminal/presets/:presetId`
// Route params: `name` is the persisted project name; `presetId` is one of the ids returned in `commandPresets`.
router.post(
	'/:name/terminal/presets/:presetId',
	validateRequest({ params: projectPresetParamsSchema }),
	asyncHandler(async (req, res, next) => {
		try {
			const execution = runProjectPreset(
				req.params.name,
				req.params.presetId,
			);
			sendData(res, execution);
		} catch (error) {
			next(mapTerminalError(error));
		}
	}),
);

// `GET /projects/:name/terminal/history`
// Route params: `name` is the persisted project name. Query param `limit` optionally trims the recent history list.
router.get(
	'/:name/terminal/history',
	validateRequest({
		params: projectNameParamsSchema,
		query: projectHistoryQuerySchema,
	}),
	asyncHandler(async (req, res, next) => {
		try {
			const items = getProjectCommandHistory(req.params.name, {
				limit: req.query.limit,
			});
			sendData(res, { items });
		} catch (error) {
			next(mapTerminalError(error));
		}
	}),
);

// `DELETE /projects/:name/terminal/history`
// Route params: `name` is the persisted project name. Clears only the saved history for this project.
router.delete(
	'/:name/terminal/history',
	validateRequest({ params: projectNameParamsSchema }),
	asyncHandler(async (req, res, next) => {
		try {
			const items = clearProjectCommandHistory(req.params.name);
			sendData(res, { items });
		} catch (error) {
			next(mapTerminalError(error));
		}
	}),
);

// `GET /projects/:name/terminal/:executionId`
// Route params: `name` is the persisted project name; `executionId` is returned when a command starts.
router.get(
	'/:name/terminal/:executionId',
	validateRequest({ params: projectExecutionParamsSchema }),
	asyncHandler(async (req, res, next) => {
		try {
			const execution = getProjectExecution(
				req.params.name,
				req.params.executionId,
			);
			sendData(res, execution);
		} catch (error) {
			next(mapTerminalError(error));
		}
	}),
);

// `POST /projects/:name/terminal/:executionId/stop`
// Route params: `name` is the persisted project name; `executionId` identifies the running command to stop.
router.post(
	'/:name/terminal/:executionId/stop',
	validateRequest({ params: projectExecutionParamsSchema }),
	asyncHandler(async (req, res, next) => {
		try {
			const execution = await stopProjectExecution(
				req.params.name,
				req.params.executionId,
			);
			sendData(res, execution);
		} catch (error) {
			next(mapTerminalError(error));
		}
	}),
);

module.exports = router;
