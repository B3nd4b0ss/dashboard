const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { __test__ } = require('../services/projectFileService');

test('normalizeRelativePath rejects traversal and absolute paths', () => {
	assert.throws(
		() => __test__.normalizeRelativePath('../secret.txt'),
		/inside the project/i,
	);
	assert.throws(
		() => __test__.normalizeRelativePath('/etc/passwd'),
		/Absolute paths are not allowed/,
	);
});

test('normalizeRelativePath normalizes separators and dot segments', () => {
	assert.equal(
		__test__.normalizeRelativePath('src\\..\\src/components/./App.jsx'),
		'src/components/App.jsx',
	);
	assert.equal(__test__.normalizeRelativePath('.'), '');
});

test('isWithinRoot accepts descendants and rejects sibling paths', () => {
	const rootPath = path.resolve('workspace-root');
	const insidePath = path.join(rootPath, 'src', 'App.jsx');
	const outsidePath = path.resolve(rootPath, '..', 'sibling', 'App.jsx');

	assert.equal(__test__.isWithinRoot(insidePath, rootPath), true);
	assert.equal(__test__.isWithinRoot(outsidePath, rootPath), false);
});
