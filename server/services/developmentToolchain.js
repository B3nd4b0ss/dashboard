const fs = require('fs');
const path = require('path');

/**
 * Safely checks whether a path exists on disk.
 *
 * @param {string} targetPath - File or directory path to probe.
 * @returns {boolean} True when the path exists and can be accessed.
 */
function fileExists(targetPath) {
	try {
		return fs.existsSync(targetPath);
	} catch (error) {
		return false;
	}
}

/**
 * Resolves a user-supplied directory path to an absolute path.
 *
 * @param {string | null | undefined} targetPath - Candidate directory path.
 * @returns {string | null} Absolute directory path, or null when no value was supplied.
 */
function normalizeDirectory(targetPath) {
	if (!targetPath) {
		return null;
	}

	return path.resolve(String(targetPath));
}

/**
 * Removes duplicate directory entries while preserving the original order.
 *
 * @param {Array<string>} entries - Directory paths gathered from environment variables or well-known locations.
 * @returns {string[]} Unique, normalized directory paths.
 */
function uniqueDirectories(entries) {
	const seen = new Set();
	const result = [];

	for (const entry of entries) {
		const normalizedEntry = normalizeDirectory(entry);
		if (!normalizedEntry) {
			continue;
		}

		const key = normalizedEntry.toLowerCase();
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		result.push(normalizedEntry);
	}

	return result;
}

/**
 * Lists child directories under a root path, optionally applying a name/path filter.
 *
 * @param {string} rootPath - Parent directory to inspect.
 * @param {(name: string, entryPath: string) => boolean | null} [filter=null] - Optional predicate used to keep matching directories.
 * @returns {string[]} Absolute child directory paths sorted by folder name.
 */
function listChildDirectories(rootPath, filter = null) {
	const normalizedRoot = normalizeDirectory(rootPath);
	if (!normalizedRoot || !fileExists(normalizedRoot)) {
		return [];
	}

	try {
		return fs
			.readdirSync(normalizedRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => path.join(normalizedRoot, entry.name))
			.filter((entryPath) =>
				typeof filter === 'function'
					? filter(path.basename(entryPath), entryPath)
					: true,
			)
			.sort((left, right) =>
				path.basename(right).localeCompare(path.basename(left)),
			);
	} catch (error) {
		return [];
	}
}

/**
 * Returns the platform-specific executable filename for a CLI tool.
 *
 * @param {string} command - Executable basename without extension.
 * @returns {string} Executable filename for the current platform.
 */
function getExecutableName(command) {
	return process.platform === 'win32' ? `${command}.exe` : command;
}

/**
 * Returns the platform-specific shell script filename for a CLI tool.
 *
 * @param {string} command - Script basename without extension.
 * @returns {string} Shell script filename for the current platform.
 */
function getCommandScriptName(command) {
	if (process.platform === 'win32') {
		return `${command}.cmd`;
	}

	return command;
}

/**
 * Validates that a candidate Java home contains both `java` and `javac`.
 *
 * @param {string} javaHome - Candidate JDK installation directory.
 * @returns {boolean} True when the directory looks like a usable JDK home.
 */
function isValidJavaHome(javaHome) {
	const normalizedHome = normalizeDirectory(javaHome);
	if (!normalizedHome) {
		return false;
	}

	return (
		fileExists(
			path.join(normalizedHome, 'bin', getExecutableName('java')),
		) &&
		fileExists(path.join(normalizedHome, 'bin', getExecutableName('javac')))
	);
}

/**
 * Validates that a candidate Maven home contains the `mvn` launcher.
 *
 * @param {string} mavenHome - Candidate Maven installation directory.
 * @returns {boolean} True when the directory looks like a usable Maven home.
 */
function isValidMavenHome(mavenHome) {
	const normalizedHome = normalizeDirectory(mavenHome);
	if (!normalizedHome) {
		return false;
	}

	return fileExists(
		path.join(normalizedHome, 'bin', getCommandScriptName('mvn')),
	);
}

/**
 * Picks the first directory that passes a validation callback.
 *
 * @param {Array<string>} candidates - Candidate installation directories.
 * @param {(candidate: string) => boolean} validator - Validation function for each directory.
 * @returns {string | null} First valid directory, or null when none match.
 */
function pickFirstValidDirectory(candidates, validator) {
	return (
		uniqueDirectories(candidates).find((candidate) =>
			validator(candidate),
		) || null
	);
}

/**
 * Attempts to locate a usable JDK installation from common Windows locations.
 *
 * @returns {string | null} Absolute Java home directory when one is discovered.
 */
function detectJavaHome() {
	const userProfile = process.env.USERPROFILE;
	const programFiles = process.env.ProgramFiles;

	const candidates = [
		process.env.JAVA_HOME,
		...listChildDirectories(path.join(userProfile || '', '.jdks')),
		...listChildDirectories(path.join(programFiles || '', 'Java')),
		...listChildDirectories(
			path.join(programFiles || '', 'Eclipse Adoptium'),
		),
		...listChildDirectories(
			path.join(programFiles || '', 'Microsoft'),
			(name) => name.toLowerCase().includes('jdk'),
		),
		...listChildDirectories(path.join(programFiles || '', 'JetBrains')).map(
			(entryPath) => path.join(entryPath, 'jbr'),
		),
	];

	return pickFirstValidDirectory(candidates, isValidJavaHome);
}

/**
 * Attempts to locate a usable Maven installation from common Windows locations.
 *
 * @returns {string | null} Absolute Maven home directory when one is discovered.
 */
function detectMavenHome() {
	const chocolateyInstall =
		process.env.ChocolateyInstall || 'C:\\ProgramData\\chocolatey';
	const userProfile = process.env.USERPROFILE;

	const candidates = [
		process.env.MAVEN_HOME,
		process.env.M2_HOME,
		...listChildDirectories(path.join(chocolateyInstall, 'lib', 'maven')),
		...listChildDirectories('C:\\', (name) =>
			name.toLowerCase().startsWith('apache-maven-'),
		),
		...listChildDirectories(
			path.join(userProfile || '', 'scoop', 'apps', 'maven'),
		),
	];

	return pickFirstValidDirectory(candidates, isValidMavenHome);
}

/**
 * Checks whether a PATH-like value already contains a given directory.
 *
 * @param {string} pathValue - Existing PATH-style string.
 * @param {string} directoryPath - Directory that should be present in the PATH.
 * @returns {boolean} True when the directory is already included.
 */
function pathIncludesDirectory(pathValue, directoryPath) {
	const normalizedDirectory = normalizeDirectory(directoryPath);
	if (!normalizedDirectory) {
		return false;
	}

	return String(pathValue || '')
		.split(path.delimiter)
		.map((entry) => normalizeDirectory(entry))
		.filter(Boolean)
		.some(
			(entry) =>
				entry.toLowerCase() === normalizedDirectory.toLowerCase(),
		);
}

/**
 * Builds an environment object with discovered Java and Maven toolchains added.
 *
 * @param {NodeJS.ProcessEnv} [baseEnv=process.env] - Environment variables to start from.
 * @returns {{env: NodeJS.ProcessEnv, javaHome: string | null, mavenHome: string | null}} Updated environment plus detected tool locations.
 */
function buildToolEnvironment(baseEnv = process.env) {
	const javaHome = detectJavaHome();
	const mavenHome = detectMavenHome();
	const nextEnv = { ...baseEnv };
	const nextPathEntries = String(baseEnv.PATH || '')
		.split(path.delimiter)
		.filter(Boolean);

	if (javaHome) {
		const javaBin = path.join(javaHome, 'bin');
		if (!pathIncludesDirectory(baseEnv.PATH, javaBin)) {
			nextPathEntries.unshift(javaBin);
		}
		nextEnv.JAVA_HOME = javaHome;
	}

	if (mavenHome) {
		const mavenBin = path.join(mavenHome, 'bin');
		if (!pathIncludesDirectory(baseEnv.PATH, mavenBin)) {
			nextPathEntries.unshift(mavenBin);
		}
		nextEnv.MAVEN_HOME = mavenHome;
		nextEnv.M2_HOME = mavenHome;
	}

	nextEnv.PATH = uniqueDirectories(nextPathEntries).join(path.delimiter);

	return {
		env: nextEnv,
		javaHome,
		mavenHome,
	};
}

/**
 * Applies the discovered Java and Maven settings to the current Node process.
 *
 * @returns {{javaHome: string | null, mavenHome: string | null}} Detected toolchain directories that were applied.
 */
function configureProcessToolEnvironment() {
	const toolEnvironment = buildToolEnvironment(process.env);
	Object.assign(process.env, toolEnvironment.env);
	return {
		javaHome: toolEnvironment.javaHome,
		mavenHome: toolEnvironment.mavenHome,
	};
}

module.exports = {
	buildToolEnvironment,
	configureProcessToolEnvironment,
	detectJavaHome,
	detectMavenHome,
};
