const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { __test__ } = require('../services/folderPickerService');

test('normalizeSelectedPath trims and resolves picker output', () => {
	const normalizedPath = __test__.normalizeSelectedPath(
		`  ${path.join('projects', 'demo')}  \n`,
	);

	assert.equal(
		normalizedPath,
		path.resolve(path.join('projects', 'demo')),
	);
});

test('isPickerCancellation recognizes common dialog cancel exit codes', () => {
	assert.equal(__test__.isPickerCancellation({ code: 1 }), true);
	assert.equal(__test__.isPickerCancellation({ code: 255 }), true);
	assert.equal(__test__.isPickerCancellation({ code: 2 }), false);
	assert.equal(__test__.isPickerCancellation({ code: 1, killed: true }), false);
});

test('getLinuxPickerInvocation prefers zenity and falls back to kdialog', () => {
	const initialPath = path.resolve('linux-projects');
	const zenityInvocation = __test__.getLinuxPickerInvocation(
		initialPath,
		'Choose a folder',
		(command) => command === 'zenity',
	);

	assert.deepEqual(zenityInvocation, {
		command: 'zenity',
		args: [
			'--file-selection',
			'--directory',
			'--title',
			'Choose a folder',
			'--filename',
			`${initialPath}${path.sep}`,
		],
	});

	const kdialogInvocation = __test__.getLinuxPickerInvocation(
		initialPath,
		'Choose a folder',
		(command) => command === 'kdialog',
	);

	assert.deepEqual(kdialogInvocation, {
		command: 'kdialog',
		args: [
			'--getexistingdirectory',
			initialPath,
			'--title',
			'Choose a folder',
		],
	});

	assert.equal(
		__test__.getLinuxPickerInvocation(
			initialPath,
			'Choose a folder',
			() => false,
		),
		null,
	);
});
