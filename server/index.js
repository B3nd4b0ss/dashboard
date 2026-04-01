const express = require('express');
const cors = require('cors');
const projectsRouter = require('./routes/projects');
const databasesRouter = require('./routes/databases');
const dockerRouter = require('./routes/docker');
const tasksRouter = require('./routes/tasks');
const membersRouter = require('./routes/members');
const systemRouter = require('./routes/system');
const { PORT } = require('./config/constants');
const {
	createCorsOptions,
	parseOriginList,
	resolveServerHost,
} = require('./config/http');
const {
	configureProcessToolEnvironment,
} = require('./services/developmentToolchain');
const { sendErrorResponse, sendNotFound } = require('./utils/httpResponses');

const detectedToolchain = configureProcessToolEnvironment();
const serverHost = resolveServerHost();
const extraAllowedOrigins = parseOriginList(
	process.env.DASHBOARD_ALLOWED_ORIGINS,
);

const app = express();
app.disable('x-powered-by');
app.use(
	cors(
		createCorsOptions({
			extraOrigins: extraAllowedOrigins,
		}),
	),
);
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

app.use((req, res) => {
	sendNotFound(res, 'Route not found');
});

app.use((error, req, res, next) => {
	if (res.headersSent) {
		next(error);
		return;
	}

	sendErrorResponse(res, error);
});

const server = app.listen(PORT, serverHost, () =>
	console.log(`Dashboard backend running on http://${serverHost}:${PORT}`),
);

function shutdown(signal) {
	console.log(`Dashboard backend received ${signal}. Shutting down...`);
	server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
