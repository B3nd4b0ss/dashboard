const { spawnSync } = require('child_process');

const POWERSHELL_COMMAND =
	process.env.ComSpec &&
	process.env.ComSpec.toLowerCase().includes('powershell')
		? process.env.ComSpec
		: `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;

/**
 * Checks whether the current platform can use Windows protected storage.
 *
 * @param {string} [platform=process.platform] - Platform identifier to inspect.
 * @returns {boolean} True when the platform supports DPAPI-backed storage.
 */
function canUseWindowsProtectedStorage(platform = process.platform) {
	return platform === 'win32';
}

/**
 * Returns the storage type the dashboard should use for local secrets.
 *
 * @param {string} [platform=process.platform] - Platform identifier to inspect.
 * @returns {'dpapi' | 'plain'} Selected storage type.
 */
function getLocalSecretStorageType(platform = process.platform) {
	return canUseWindowsProtectedStorage(platform) ? 'dpapi' : 'plain';
}

/**
 * Runs a small PowerShell command and returns trimmed stdout.
 *
 * @param {string} script - PowerShell script to execute.
 * @param {object} [env={}] - Extra environment variables used by the script.
 * @returns {string} Trimmed stdout content.
 */
function runPowerShellCommand(script, env = {}) {
	const result = spawnSync(
		POWERSHELL_COMMAND,
		[
			'-NoLogo',
			'-NoProfile',
			'-NonInteractive',
			'-ExecutionPolicy',
			'Bypass',
			'-Command',
			script,
		],
		{
			encoding: 'utf8',
			windowsHide: true,
			env: {
				...process.env,
				...env,
			},
		},
	);

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		throw new Error(
			result.stderr?.trim() ||
				'Unable to access Windows protected storage.',
		);
	}

	return result.stdout.trim();
}

/**
 * Encrypts a local secret using the current Windows user profile.
 *
 * @param {string} value - Plaintext secret value.
 * @returns {string} DPAPI-protected blob.
 */
function encryptWithWindowsProfile(value) {
	return runPowerShellCommand(
		'$secure = ConvertTo-SecureString -String $env:DASHBOARD_SECRET_VALUE -AsPlainText -Force; ConvertFrom-SecureString $secure',
		{
			DASHBOARD_SECRET_VALUE: value,
		},
	);
}

/**
 * Decrypts a DPAPI-protected blob using the current Windows user profile.
 *
 * @param {string} value - DPAPI-protected blob.
 * @returns {string} Plaintext secret value.
 */
function decryptWithWindowsProfile(value) {
	return runPowerShellCommand(
		'$secure = ConvertTo-SecureString -String $env:DASHBOARD_SECRET_BLOB; $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) } }',
		{
			DASHBOARD_SECRET_BLOB: value,
		},
	);
}

/**
 * Encrypts a secret before it is persisted locally.
 *
 * @param {string} value - Plaintext secret.
 * @param {{platform?: string, encryptValue?: Function}} [options={}] - Test overrides.
 * @returns {string} Persisted secret value.
 */
function encryptLocalSecret(value, options = {}) {
	const secret = String(value || '');
	if (!secret) {
		return '';
	}

	const platform = options.platform || process.platform;
	const encryptValue = options.encryptValue || encryptWithWindowsProfile;

	if (!canUseWindowsProtectedStorage(platform)) {
		return secret;
	}

	return encryptValue(secret);
}

/**
 * Decrypts a persisted local secret when protected storage is in use.
 *
 * @param {string} value - Persisted secret value.
 * @param {'dpapi' | 'plain'} [storageType='plain'] - Storage type used at rest.
 * @param {{platform?: string, decryptValue?: Function}} [options={}] - Test overrides.
 * @returns {string} Plaintext secret value.
 */
function decryptLocalSecret(value, storageType = 'plain', options = {}) {
	const secret = String(value || '');
	if (!secret) {
		return '';
	}

	const platform = options.platform || process.platform;
	const decryptValue = options.decryptValue || decryptWithWindowsProfile;

	if (storageType !== 'dpapi' || !canUseWindowsProtectedStorage(platform)) {
		return secret;
	}

	return decryptValue(secret);
}

module.exports = {
	canUseWindowsProtectedStorage,
	decryptLocalSecret,
	encryptLocalSecret,
	getLocalSecretStorageType,
	__test__: {
		decryptWithWindowsProfile,
		encryptWithWindowsProfile,
		runPowerShellCommand,
	},
};
