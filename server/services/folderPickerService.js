const fs = require('fs');
const path = require('path');
const { execFile, spawnSync } = require('child_process');
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

/**
 * Checks whether a native desktop helper command is available.
 *
 * @param {string} command - Executable to probe.
 * @param {string[]} [args=['--version']] - Optional probe arguments.
 * @returns {boolean} True when the command can be started.
 */
function commandExists(command, args = ['--version']) {
	const result = spawnSync(command, args, {
		stdio: 'ignore',
	});

	return !result.error;
}

/**
 * Normalizes the final selected path returned by a native picker.
 *
 * @param {string} selectedPath - Raw path returned by the picker.
 * @returns {string | null} Absolute normalized folder path.
 */
function normalizeSelectedPath(selectedPath) {
	const trimmedPath = String(selectedPath || '').trim();
	return trimmedPath ? path.resolve(trimmedPath) : null;
}

/**
 * Converts low-level folder picker failures into a clearer message for the UI.
 *
 * @param {Error | null | undefined} error - Error returned by the child process callback.
 * @param {string} stdout - Stdout captured from the picker script.
 * @param {string} stderr - Stderr captured from the picker script.
 * @returns {string} User-friendly error message.
 */
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

/**
 * Reports whether a picker invocation ended because the user canceled it.
 *
 * @param {Error | null | undefined} error - Error returned by the child process callback.
 * @returns {boolean} True when the picker exit code represents a cancellation.
 */
function isPickerCancellation(error) {
	if (!error || error.killed) {
		return false;
	}

	return error.code === 1 || error.code === 255;
}

/**
 * Chooses the Linux desktop picker helper when one is installed.
 *
 * @param {string} initialPath - Absolute initial path to highlight.
 * @param {string} title - Dialog title shown to the user.
 * @returns {{command: string, args: string[]} | null} Native picker invocation, or null when unavailable.
 */
function getLinuxPickerInvocation(
	initialPath,
	title,
	commandExistsImpl = commandExists,
) {
	if (commandExistsImpl('zenity')) {
		return {
			command: 'zenity',
			args: [
				'--file-selection',
				'--directory',
				'--title',
				title,
				'--filename',
				initialPath.endsWith(path.sep)
					? initialPath
					: `${initialPath}${path.sep}`,
			],
		};
	}

	if (commandExistsImpl('kdialog')) {
		return {
			command: 'kdialog',
			args: ['--getexistingdirectory', initialPath, '--title', title],
		};
	}

	return null;
}

/**
 * Opens a Linux desktop folder picker when a supported helper is installed.
 *
 * @param {{initialPath: string, title: string}} options - Normalized picker options.
 * @returns {Promise<{canceled: boolean, path: string | null}>} Selection result returned by the native picker.
 */
function openLinuxFolderPicker({ initialPath, title }) {
	if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
		throw new Error(
			'Native folder picker requires a Linux desktop session. Enter the folder path manually instead.',
		);
	}

	const pickerInvocation = getLinuxPickerInvocation(initialPath, title);
	if (!pickerInvocation) {
		throw new Error(
			'Native folder picker on Linux requires zenity or kdialog. Install one of them, or enter the folder path manually instead.',
		);
	}

	return new Promise((resolve, reject) => {
		execFile(
			pickerInvocation.command,
			pickerInvocation.args,
			{
				maxBuffer: 1024 * 1024,
				timeout: FOLDER_PICKER_TIMEOUT_MS,
			},
			(error, stdout, stderr) => {
				if (isPickerCancellation(error)) {
					resolve({ canceled: true, path: null });
					return;
				}

				if (error) {
					reject(
						new Error(
							getFriendlyPickerError(error, stdout, stderr),
						),
					);
					return;
				}

				const selectedPath = normalizeSelectedPath(stdout);
				if (!selectedPath) {
					resolve({ canceled: true, path: null });
					return;
				}

				resolve({ canceled: false, path: selectedPath });
			},
		);
	});
}

/**
 * Opens the native Windows folder picker script and resolves the selected path.
 *
 * @param {{initialPath?: string, title?: string}} [options={}] - Picker options supplied by the API route.
 * @param {string} [options.initialPath=PROJECTS_DIR] - Initial folder to highlight when the dialog opens.
 * @param {string} [options.title='Choose a folder'] - Dialog title shown to the user.
 * @returns {Promise<{canceled: boolean, path: string | null}>} Selection result returned by the PowerShell helper.
 */
function openFolderPicker({
	initialPath = PROJECTS_DIR,
	title = 'Choose a folder',
} = {}) {
	const requestedInitialPath = String(initialPath || '').trim();
	const normalizedInitialPath = requestedInitialPath
		? path.isAbsolute(requestedInitialPath)
			? path.resolve(requestedInitialPath)
			: path.resolve(PROJECTS_DIR, requestedInitialPath)
		: PROJECTS_DIR;
	const normalizedTitle = String(title || '').trim() || 'Choose a folder';

	if (process.platform === 'linux') {
		return openLinuxFolderPicker({
			initialPath: normalizedInitialPath,
			title: normalizedTitle,
		});
	}

	if (process.platform !== 'win32') {
		throw new Error(
			'Native folder picker is only available on Windows and Linux desktops. Enter the folder path manually instead.',
		);
	}

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
						new Error(
							getFriendlyPickerError(error, stdout, stderr),
						),
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
					reject(
						new Error(
							'Folder picker returned an unexpected result',
						),
					);
				}
			},
		);
	});
}

module.exports = {
	openFolderPicker,
	__test__: {
		commandExists,
		getLinuxPickerInvocation,
		isPickerCancellation,
		normalizeSelectedPath,
	},
};
