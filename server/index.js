const express = require('express');
const cors = require('cors');
const projectsRouter = require('./routes/projects');
const databasesRouter = require('./routes/databases');
const dockerRouter = require('./routes/docker');
const tasksRouter = require('./routes/tasks');
const membersRouter = require('./routes/members');
const { PORT } = require('./config/constants');

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/projects', projectsRouter);
app.use('/databases', databasesRouter);
app.use('/docker', dockerRouter);
app.use('/tasks', tasksRouter);
app.use('/members', membersRouter);

const server = app.listen(PORT, () =>
	console.log(`Dashboard backend running on port ${PORT}`),
);

function shutdown(signal) {
	console.log(`Dashboard backend received ${signal}. Shutting down...`);
	server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
