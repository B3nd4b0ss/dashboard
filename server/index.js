const express = require('express');
const cors = require('cors');
const projectsRouter = require('./routes/projects');
const databasesRouter = require('./routes/databases');
const { PORT } = require('./config/constants');

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/projects', projectsRouter);
app.use('/databases', databasesRouter);

app.listen(PORT, () =>
	console.log(`Dashboard backend running on port ${PORT}`),
);
