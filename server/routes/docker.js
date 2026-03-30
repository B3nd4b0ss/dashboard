const express = require('express');
const router = express.Router();
const dockerHubService = require('../services/dockerHubService');

// `GET /docker`
// Returns Docker daemon status, stacks, standalone containers, and images.
router.get('/', async (req, res) => {
	try {
		const overview = await dockerHubService.getDockerOverview();
		res.json(overview);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// `GET /docker/stacks/:projectName`
// Route params: `projectName` is the compose stack id shown in the Docker overview.
router.get('/stacks/:projectName', async (req, res) => {
	try {
		const stack = await dockerHubService.getDockerStack(
			req.params.projectName,
		);
		res.json(stack);
	} catch (err) {
		const statusCode = err.message.includes('Docker is not running')
			? 503
			: err.message.includes('not found')
				? 404
				: 400;
		res.status(statusCode).json({ error: err.message });
	}
});

// `GET /docker/containers/:name/logs`
// Route params: `name` is the Docker container name.
// Query params: `tail` optionally controls how many recent log lines are returned.
router.get('/containers/:name/logs', async (req, res) => {
	try {
		const logs = await dockerHubService.getDockerContainerLogs(
			req.params.name,
			req.query.tail,
		);
		res.json(logs);
	} catch (err) {
		const statusCode = err.message.includes('Docker is not running')
			? 503
			: 400;
		res.status(statusCode).json({ error: err.message });
	}
});

// `POST /docker/containers/:name/start`
// Route params: `name` is the Docker container name.
router.post('/containers/:name/start', async (req, res) => {
	try {
		await dockerHubService.startDockerContainer(req.params.name);
		res.json({ message: 'Container started' });
	} catch (err) {
		const statusCode = err.message.includes('Docker is not running')
			? 503
			: 400;
		res.status(statusCode).json({ error: err.message });
	}
});

// `POST /docker/containers/:name/stop`
// Route params: `name` is the Docker container name.
router.post('/containers/:name/stop', async (req, res) => {
	try {
		await dockerHubService.stopDockerContainer(req.params.name);
		res.json({ message: 'Container stopped' });
	} catch (err) {
		const statusCode = err.message.includes('Docker is not running')
			? 503
			: 400;
		res.status(statusCode).json({ error: err.message });
	}
});

// `POST /docker/containers/:name/restart`
// Route params: `name` is the Docker container name.
router.post('/containers/:name/restart', async (req, res) => {
	try {
		await dockerHubService.restartDockerContainer(req.params.name);
		res.json({ message: 'Container restarted' });
	} catch (err) {
		const statusCode = err.message.includes('Docker is not running')
			? 503
			: 400;
		res.status(statusCode).json({ error: err.message });
	}
});

module.exports = router;
