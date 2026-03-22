const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data.json');
const DATABASES_FILE = path.join(__dirname, '../../databases.json');
const PROJECTS_DIR = path.join(__dirname, '../../projects');

module.exports = {
	DATA_FILE,
	DATABASES_FILE,
	PROJECTS_DIR,
	PORT: 4000,
};
