const fs = require('fs');
const path = require('path');

const testsDirectory = __dirname;

const testFiles = fs
	.readdirSync(testsDirectory)
	.filter(
		(fileName) =>
			fileName.endsWith('.test.js') && fileName !== 'run-tests.js',
	)
	.sort((left, right) => left.localeCompare(right));

for (const fileName of testFiles) {
	require(path.join(testsDirectory, fileName));
}
