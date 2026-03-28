const express = require('express');
const cors = require('cors');
const projectsRouter = require('./routes/projects');
const databasesRouter = require('./routes/databases');
const dockerRouter = require('./routes/docker');
const tasksRouter = require('./routes/tasks');
const membersRouter = require('./routes/members');
const systemRouter = require('./routes/system');
const { PORT } = require('./config/constants');
const { configureProcessToolEnvironment } = require('./services/developmentToolchain');

const detectedToolchain = configureProcessToolEnvironment();

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

if (detectedToolchain.javaHome || detectedToolchain.mavenHome) {
	console.log(
		`Dev toolchain ready: java=${detectedToolchain.javaHome || 'missing'}, maven=${detectedToolchain.mavenHome || 'missing'}`,
	);
}

// Routes
app.use('/projects', projectsRouter);
app.use('/databases', databasesRouter);
app.use('/docker', dockerRouter);
app.use('/tasks', tasksRouter);
app.use('/members', membersRouter);
app.use('/system', systemRouter);

const server = app.listen(PORT, () =>
	console.log(`Dashboard backend running on port ${PORT}`),
);

function shutdown(signal) {
	console.log(`Dashboard backend received ${signal}. Shutting down...`);
	server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
