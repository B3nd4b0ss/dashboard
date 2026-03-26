const express = require('express');
const router = express.Router();
const databaseService = require('../services/databaseService');
const { dockerAvailable } = require('../services/docker');

// Get all databases
router.get('/', (req, res) => {
	const databases = databaseService.getAllDatabases();
	res.json(databases);
});

// Create database
router.post('/', async (req, res) => {
	const { name, type, port, withClient } = req.body;
	if (!name || !type) {
		return res.status(400).json({ error: 'Name and type required' });
	}

	// Check if Docker is available
	if (!(await dockerAvailable())) {
		return res.status(503).json({
			error: 'Docker is not running. Please start Docker Desktop and try again.',
		});
	}

	try {
		const database = await databaseService.createDatabase(
			name,
			type,
			port,
			withClient,
		);
		res.json(database);
	} catch (err) {
		console.error('Database creation error:', err);
		res.status(400).json({ error: err.message });
	}
});

router.post('/create-stream', async (req, res) => {
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

	eventEmitter.on('complete', (database) => {
		res.write(
			`data: ${JSON.stringify({ type: 'complete', database })}\n\n`,
		);
		res.end();
	});

	const { name, type, port, withClient } = req.body;
	if (!name || !type) {
		eventEmitter.emit('error', 'Name and type required');
		return;
	}

	if (!(await dockerAvailable())) {
		eventEmitter.emit(
			'error',
			'Docker is not running. Please start Docker Desktop and try again.',
		);
		return;
	}

	try {
		await databaseService.createDatabaseWithStream(
			{ name, type, port, withClient },
			eventEmitter,
		);
	} catch (err) {
		if (!res.writableEnded) {
			eventEmitter.emit('error', err.message);
		}
	}
});

// Delete database
router.delete('/:id', async (req, res) => {
	try {
		await databaseService.deleteDatabase(req.params.id);
		res.json({ message: 'Database deleted' });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Start database container
router.post('/:id/start', async (req, res) => {
	try {
		await databaseService.startDatabaseContainer(req.params.id);
		res.json({ message: 'Database started' });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Stop database container
router.post('/:id/stop', async (req, res) => {
	try {
		await databaseService.stopDatabaseContainer(req.params.id);
		res.json({ message: 'Database stopped' });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Start client container
router.post('/:id/client/start', async (req, res) => {
	try {
		await databaseService.startClientContainer(req.params.id);
		res.json({ message: 'Client started' });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Stop client container
router.post('/:id/client/stop', async (req, res) => {
	try {
		await databaseService.stopClientContainer(req.params.id);
		res.json({ message: 'Client stopped' });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Get database status
router.get('/:id/status', async (req, res) => {
	try {
		const db = databaseService.getDatabaseById(req.params.id);
		if (!db) return res.status(404).json({ error: 'Database not found' });
		const status = await databaseService.getDatabaseStatus(req.params.id);
		res.json({ status });
	} catch (err) {
		console.error('Status error:', err);
		res.status(500).json({ error: 'Failed to get status' });
	}
});

module.exports = router;
