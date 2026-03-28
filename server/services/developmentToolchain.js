const fs = require('fs');
const path = require('path');

function fileExists(targetPath) {
	try {
		return fs.existsSync(targetPath);
	} catch (error) {
		return false;
	}
}

function normalizeDirectory(targetPath) {
	if (!targetPath) {
		return null;
	}

	return path.resolve(String(targetPath));
}

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

function getExecutableName(command) {
	return process.platform === 'win32' ? `${command}.exe` : command;
}

function getCommandScriptName(command) {
	if (process.platform === 'win32') {
		return `${command}.cmd`;
	}

	return command;
}

function isValidJavaHome(javaHome) {
	const normalizedHome = normalizeDirectory(javaHome);
	if (!normalizedHome) {
		return false;
	}

	return (
		fileExists(path.join(normalizedHome, 'bin', getExecutableName('java'))) &&
		fileExists(path.join(normalizedHome, 'bin', getExecutableName('javac')))
	);
}

function isValidMavenHome(mavenHome) {
	const normalizedHome = normalizeDirectory(mavenHome);
	if (!normalizedHome) {
		return false;
	}

	return fileExists(
		path.join(normalizedHome, 'bin', getCommandScriptName('mvn')),
	);
}

function pickFirstValidDirectory(candidates, validator) {
	return uniqueDirectories(candidates).find((candidate) => validator(candidate)) || null;
}

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
		...listChildDirectories(
			path.join(programFiles || '', 'JetBrains'),
		).map((entryPath) => path.join(entryPath, 'jbr')),
	];

	return pickFirstValidDirectory(candidates, isValidJavaHome);
}

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

function pathIncludesDirectory(pathValue, directoryPath) {
	const normalizedDirectory = normalizeDirectory(directoryPath);
	if (!normalizedDirectory) {
		return false;
	}

	return String(pathValue || '')
		.split(path.delimiter)
		.map((entry) => normalizeDirectory(entry))
		.filter(Boolean)
		.some((entry) => entry.toLowerCase() === normalizedDirectory.toLowerCase());
}

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
