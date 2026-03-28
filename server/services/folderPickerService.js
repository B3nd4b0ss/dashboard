const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { PROJECTS_DIR } = require('../config/constants');

const POWERSHELL_COMMAND = fs.existsSync(
	path.join(
		process.env.SystemRoot || 'C:\\Windows',
		'System32',
		'WindowsPowerShell',
		'v1.0',
		'powershell.exe',
	),
)
	? path.join(
			process.env.SystemRoot || 'C:\\Windows',
			'System32',
			'WindowsPowerShell',
			'v1.0',
			'powershell.exe',
		)
	: 'powershell.exe';

const FOLDER_PICKER_SCRIPT = path.join(
	__dirname,
	'..',
	'..',
	'scripts',
	'pick-folder-dialog.ps1',
);
const FOLDER_PICKER_TIMEOUT_MS = 90 * 1000;

function getFriendlyPickerError(error, stdout, stderr) {
	if (error?.killed || /timed out/i.test(error?.message || '')) {
		return 'Folder picker timed out before a folder was chosen. If it opened behind other windows, bring it to the front and try again.';
	}

	return (
		String(stderr || '').trim() ||
		String(stdout || '').trim() ||
		error?.message ||
		'Unable to open the folder picker'
	);
}

function openFolderPicker({
	initialPath = PROJECTS_DIR,
	title = 'Choose a folder',
} = {}) {
	if (process.platform !== 'win32') {
		throw new Error('Native folder picker is only available on Windows');
	}

	const requestedInitialPath = String(initialPath || '').trim();
	const normalizedInitialPath = requestedInitialPath
		? path.isAbsolute(requestedInitialPath)
			? path.resolve(requestedInitialPath)
			: path.resolve(PROJECTS_DIR, requestedInitialPath)
		: PROJECTS_DIR;
	const normalizedTitle = String(title || '').trim() || 'Choose a folder';

	return new Promise((resolve, reject) => {
		execFile(
			POWERSHELL_COMMAND,
			[
				'-NoLogo',
				'-NoProfile',
				'-ExecutionPolicy',
				'Bypass',
				'-STA',
				'-WindowStyle',
				'Normal',
				'-File',
				FOLDER_PICKER_SCRIPT,
				'-InitialPath',
				normalizedInitialPath,
				'-Title',
				normalizedTitle,
			],
			{
				windowsHide: false,
				maxBuffer: 1024 * 1024,
				timeout: FOLDER_PICKER_TIMEOUT_MS,
			},
			(error, stdout, stderr) => {
				if (error) {
					reject(
						new Error(getFriendlyPickerError(error, stdout, stderr)),
					);
					return;
				}

				const payload = String(stdout || '').trim();
				if (!payload) {
					resolve({ canceled: true, path: null });
					return;
				}

				try {
					resolve(JSON.parse(payload));
				} catch (parseError) {
					reject(new Error('Folder picker returned an unexpected result'));
				}
			},
		);
	});
}

module.exports = {
	openFolderPicker,
};
