const fs = require('fs-extra');
const https = require('https');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { getProjectScaffold } = require('./projectScaffold');
const { getGitHubSettings } = require('./settingsService');
const { getProjectPath } = require('../utils/projectPaths');

const DEFAULT_BRANCH = 'main';
const DEFAULT_COMMIT_MESSAGE = 'Initial commit';
const ROOT_GITIGNORE_LINES = [
	'node_modules/',
	'frontend/node_modules/',
	'backend/node_modules/',
	'dist/',
	'frontend/dist/',
	'backend/dist/',
	'coverage/',
	'.env',
	'.env.*',
	'frontend/.env',
	'backend/.env',
	'out/',
	'target/',
	'*.log',
	'.DS_Store',
	'Thumbs.db',
];

function getTemplateLabel(value, fallback) {
	return value ? String(value) : fallback;
}

function commandExists(command, args = ['--version']) {
	const result = spawnSync(command, args, {
		stdio: 'ignore',
		windowsHide: true,
	});

	return !result.error && result.status === 0;
}

function emitLog(onLog, message) {
	if (typeof onLog === 'function') {
		onLog(message);
	}
}

function slugifyBranchToken(value, fallback = 'task') {
	const normalized = String(value || fallback)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return normalized || fallback;
}

function runCommand(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const stdout = [];
		const stderr = [];
		const proc = spawn(command, args, {
			cwd: options.cwd,
			env: options.env,
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
		});

		proc.stdout.on('data', (chunk) => {
			stdout.push(chunk);
			options.onStdout?.(chunk.toString());
		});

		proc.stderr.on('data', (chunk) => {
			stderr.push(chunk);
			options.onStderr?.(chunk.toString());
		});

		proc.on('error', reject);
		proc.on('close', (code) => {
			const stdoutText = Buffer.concat(stdout).toString('utf8').trim();
			const stderrText = Buffer.concat(stderr).toString('utf8').trim();

			if (code === 0) {
				resolve({
					stdout: stdoutText,
					stderr: stderrText,
				});
				return;
			}

			const message =
				stderrText || stdoutText || `${command} exited with code ${code}.`;
			const error = new Error(message);
			error.code = code;
			error.stdout = stdoutText;
			error.stderr = stderrText;
			reject(error);
		});
	});
}

function readGitConfig(projectPath, args) {
	const result = spawnSync('git', args, {
		cwd: projectPath,
		windowsHide: true,
		encoding: 'utf8',
	});

	if (result.error || result.status !== 0) {
		return '';
	}

	return String(result.stdout || '').trim();
}

async function gitRefExists(projectPath, refName) {
	try {
		await runCommand('git', ['rev-parse', '--verify', refName], {
			cwd: projectPath,
		});
		return true;
	} catch (error) {
		return false;
	}
}

function readCurrentGitBranch(projectPath) {
	return readGitConfig(projectPath, ['symbolic-ref', '--short', 'HEAD']);
}

async function ensureRootGitignore(projectPath) {
	const gitignorePath = path.join(projectPath, '.gitignore');
	const gitignoreContent = ROOT_GITIGNORE_LINES.join('\n');

	if (!(await fs.pathExists(gitignorePath))) {
		await fs.writeFile(gitignorePath, `${gitignoreContent}\n`);
		return;
	}

	const currentContent = await fs.readFile(gitignorePath, 'utf8');
	const currentLines = new Set(
		currentContent
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean),
	);
	const missingLines = ROOT_GITIGNORE_LINES.filter(
		(line) => !currentLines.has(line),
	);

	if (missingLines.length === 0) {
		return;
	}

	const nextContent = `${currentContent.replace(/\s*$/, '')}\n\n${missingLines.join('\n')}\n`;
	await fs.writeFile(gitignorePath, nextContent);
}

function buildRootReadmeContent(project, projectScaffold) {
	const sections = [
		`# ${project.name}`,
		'',
		projectScaffold.description,
		'',
		'## Workspace',
		'',
		`- Frontend: ${getTemplateLabel(project.frontend, 'None')}`,
		`- Backend: ${getTemplateLabel(project.backend, 'None')}`,
		`- Default branch: ${DEFAULT_BRANCH}`,
	];

	return `${sections.join('\n')}\n`;
}

async function ensureRootReadme(projectPath, project, projectScaffold) {
	const readmePath = path.join(projectPath, 'README.md');
	if (await fs.pathExists(readmePath)) {
		return;
	}

	await fs.writeFile(
		readmePath,
		buildRootReadmeContent(project, projectScaffold),
	);
}

async function initializeGitRepository(projectPath) {
	try {
		await runCommand('git', ['init', '-b', DEFAULT_BRANCH], {
			cwd: projectPath,
		});
	} catch (error) {
		await runCommand('git', ['init'], {
			cwd: projectPath,
		});
		await runCommand('git', ['branch', '-M', DEFAULT_BRANCH], {
			cwd: projectPath,
		});
	}
}

async function ensureGitIdentity(projectPath, fallbackIdentity) {
	const localName = readGitConfig(projectPath, ['config', '--get', 'user.name']);
	const globalName = readGitConfig(projectPath, [
		'config',
		'--global',
		'--get',
		'user.name',
	]);
	const localEmail = readGitConfig(projectPath, ['config', '--get', 'user.email']);
	const globalEmail = readGitConfig(projectPath, [
		'config',
		'--global',
		'--get',
		'user.email',
	]);

	if (!localName && !globalName) {
		await runCommand('git', ['config', 'user.name', fallbackIdentity.name], {
			cwd: projectPath,
		});
	}

	if (!localEmail && !globalEmail) {
		await runCommand(
			'git',
			['config', 'user.email', fallbackIdentity.email],
			{
				cwd: projectPath,
			},
		);
	}
}

function githubRequest(method, requestPath, token, body = null) {
	return new Promise((resolve, reject) => {
		const payload = body ? Buffer.from(JSON.stringify(body)) : null;
		const req = https.request(
			{
				hostname: 'api.github.com',
				path: requestPath,
				method,
				headers: {
					Accept: 'application/vnd.github+json',
					'User-Agent': 'dashboard-local-app',
					Authorization: `Bearer ${token}`,
					'X-GitHub-Api-Version': '2022-11-28',
					...(payload
						? {
								'Content-Type': 'application/json',
								'Content-Length': payload.length,
							}
						: {}),
				},
			},
			(res) => {
				const chunks = [];

				res.on('data', (chunk) => chunks.push(chunk));
				res.on('end', () => {
					const text = Buffer.concat(chunks).toString('utf8');
					let data = null;

					if (text) {
						try {
							data = JSON.parse(text);
						} catch (error) {
							data = text;
						}
					}

					if (res.statusCode >= 200 && res.statusCode < 300) {
						resolve(data || {});
						return;
					}

					const message =
						data?.message ||
						(typeof data === 'string' ? data : 'GitHub request failed.');
					const error = new Error(message);
					error.statusCode = res.statusCode;
					error.response = data;
					reject(error);
				});
			},
		);

		req.on('error', reject);

		if (payload) {
			req.write(payload);
		}

		req.end();
	});
}

function buildFallbackIdentity(githubSettings) {
	const ownerToken = String(githubSettings.owner || 'dashboard').trim();
	const normalizedOwner = ownerToken || 'dashboard';

	return {
		name: normalizedOwner,
		email: `${normalizedOwner.replace(/[^a-z0-9._-]/gi, '').toLowerCase() || 'dashboard'}@users.noreply.github.com`,
	};
}

async function fetchAuthenticatedGitHubUser(token) {
	return githubRequest('GET', '/user', token);
}

async function createOrReuseGitHubRepository({
	token,
	owner,
	repositoryName,
	visibility,
	description,
}) {
	const authenticatedUser = await fetchAuthenticatedGitHubUser(token);
	const resolvedOwner = String(owner || authenticatedUser.login || '').trim();
	const isPersonalRepository =
		resolvedOwner.toLowerCase() ===
		String(authenticatedUser.login || '').trim().toLowerCase();
	const requestPath = isPersonalRepository
		? '/user/repos'
		: `/orgs/${encodeURIComponent(resolvedOwner)}/repos`;
	const requestBody = {
		name: repositoryName,
		private: visibility !== 'public',
		description,
		auto_init: false,
	};

	try {
		const repository = await githubRequest(
			'POST',
			requestPath,
			token,
			requestBody,
		);

		return {
			owner: resolvedOwner,
			name: repository.name,
			url: repository.html_url,
			cloneUrl: repository.clone_url,
			visibility: repository.private ? 'private' : 'public',
		};
	} catch (error) {
		const repoExists =
			error.statusCode === 422 &&
			String(error.message || '')
				.toLowerCase()
				.includes('already exists');

		if (!repoExists) {
			throw error;
		}

		const existingRepository = await githubRequest(
			'GET',
			`/repos/${encodeURIComponent(resolvedOwner)}/${encodeURIComponent(repositoryName)}`,
			token,
		);

		return {
			owner: resolvedOwner,
			name: existingRepository.name,
			url: existingRepository.html_url,
			cloneUrl: existingRepository.clone_url,
			visibility: existingRepository.private ? 'private' : 'public',
		};
	}
}

function buildGitHubPushArguments(remoteName, branchName, token) {
	const encodedToken = Buffer.from(`x-access-token:${token}`).toString('base64');

	return [
		'-c',
		`http.https://github.com/.extraheader=AUTHORIZATION: basic ${encodedToken}`,
		'push',
		'-u',
		remoteName,
		branchName,
	];
}

function buildTaskBranchName(task) {
	const typeSegment = slugifyBranchToken(task.type, 'task');
	const keySegment = slugifyBranchToken(task.ticketKey || task.id, 'task');
	const titleSegment = slugifyBranchToken(task.title, '');

	return titleSegment
		? `${typeSegment}/${keySegment}-${titleSegment}`
		: `${typeSegment}/${keySegment}`;
}

async function configureGitRemote(projectPath, remoteName, remoteUrl) {
	const currentRemoteUrl = readGitConfig(projectPath, [
		'remote',
		'get-url',
		remoteName,
	]);

	if (!currentRemoteUrl) {
		await runCommand('git', ['remote', 'add', remoteName, remoteUrl], {
			cwd: projectPath,
		});
		return;
	}

	if (currentRemoteUrl !== remoteUrl) {
		await runCommand('git', ['remote', 'set-url', remoteName, remoteUrl], {
			cwd: projectPath,
		});
	}
}

async function initializeProjectRepository(project, options = {}) {
	const projectPath = options.projectPath || project.projectPath;
	const githubSettings = getGitHubSettings();
	const projectScaffold = getProjectScaffold(project);
	const repositoryName = projectScaffold.projectSlug;
	const fallbackIdentity = buildFallbackIdentity(githubSettings);

	if (!commandExists('git')) {
		return {
			provider: githubSettings.autoCreateRepo ? 'github' : 'git',
			status: 'failed',
			name: repositoryName,
			owner: githubSettings.owner || '',
			visibility: githubSettings.visibility,
			defaultBranch: DEFAULT_BRANCH,
			localInitializedAt: null,
			lastError: 'Git is not available on this machine.',
		};
	}

	const githubPublishingEnabled =
		githubSettings.autoCreateRepo && Boolean(githubSettings.token);
	let remoteRepository = null;
	let repositoryError = null;

	try {
		emitLog(options.onLog, 'Initializing git repository...');
		await ensureRootReadme(projectPath, project, projectScaffold);
		await ensureRootGitignore(projectPath);
		await initializeGitRepository(projectPath);
		await ensureGitIdentity(projectPath, fallbackIdentity);
	} catch (error) {
		return {
			provider: githubSettings.autoCreateRepo ? 'github' : 'git',
			status: 'failed',
			name: repositoryName,
			owner: githubSettings.owner || '',
			visibility: githubSettings.visibility,
			defaultBranch: DEFAULT_BRANCH,
			localInitializedAt: null,
			lastError: error.message,
		};
	}

	if (githubPublishingEnabled) {
		try {
			emitLog(options.onLog, 'Creating GitHub repository...');
			remoteRepository = await createOrReuseGitHubRepository({
				token: githubSettings.token,
				owner: githubSettings.owner,
				repositoryName,
				visibility: githubSettings.visibility,
				description: projectScaffold.description,
			});
			emitLog(options.onLog, 'Configuring origin remote...');
			await configureGitRemote(projectPath, 'origin', remoteRepository.cloneUrl);
		} catch (error) {
			repositoryError = error.message;
			emitLog(options.onLog, `GitHub origin setup failed: ${error.message}`);
		}
	}

	try {
		emitLog(options.onLog, 'Creating first commit...');
		await runCommand('git', ['add', '.'], { cwd: projectPath });
		await runCommand(
			'git',
			['commit', '--allow-empty', '-m', DEFAULT_COMMIT_MESSAGE],
			{ cwd: projectPath },
		);
	} catch (error) {
		return {
			provider: githubSettings.autoCreateRepo ? 'github' : 'git',
			status: 'failed',
			name: repositoryName,
			owner: githubSettings.owner || '',
			visibility: githubSettings.visibility,
			defaultBranch: DEFAULT_BRANCH,
			localInitializedAt: null,
			lastError: error.message,
		};
	}

	const now = new Date().toISOString();
	const baseRepository = {
		name: repositoryName,
		owner: githubSettings.owner || '',
		visibility: githubSettings.visibility,
		defaultBranch: DEFAULT_BRANCH,
		localInitializedAt: now,
	};

	if (!githubPublishingEnabled) {
		emitLog(options.onLog, 'Local git repository is ready.');
		return {
			...baseRepository,
			provider: 'git',
			status: 'local-only',
			lastError: null,
		};
	}

	if (repositoryError || !remoteRepository) {
		return {
			...baseRepository,
			provider: 'github',
			status: 'failed',
			lastError:
				repositoryError || 'GitHub origin could not be configured.',
		};
	}

	try {
		emitLog(options.onLog, 'Pushing first commit to GitHub...');
		await runCommand(
			'git',
			buildGitHubPushArguments('origin', DEFAULT_BRANCH, githubSettings.token),
			{
				cwd: projectPath,
				env: {
					...process.env,
					GIT_TERMINAL_PROMPT: '0',
				},
			},
		);
		emitLog(options.onLog, `GitHub remote connected: ${remoteRepository.url}`);

		return {
			...baseRepository,
			...remoteRepository,
			provider: 'github',
			status: 'connected',
			pushedAt: new Date().toISOString(),
			lastError: null,
		};
	} catch (error) {
		emitLog(options.onLog, `GitHub publishing failed: ${error.message}`);
		return {
			...baseRepository,
			...remoteRepository,
			provider: 'github',
			status: 'failed',
			lastError: error.message,
		};
	}
}

async function createTaskBranch(project, task, options = {}) {
	const projectPath = options.projectPath || getProjectPath(project);
	const githubSettings = getGitHubSettings();
	const branchName = options.branchName || buildTaskBranchName(task);
	const remoteUrl = readGitConfig(projectPath, ['remote', 'get-url', 'origin']) || null;
	const configuredBaseBranch = project?.repository?.defaultBranch || DEFAULT_BRANCH;

	if (!commandExists('git')) {
		throw new Error('Git is not available on this machine.');
	}

	if (!(await fs.pathExists(path.join(projectPath, '.git')))) {
		throw new Error('This project does not have a git repository yet.');
	}

	const baseBranch = (await gitRefExists(projectPath, configuredBaseBranch))
		? configuredBaseBranch
		: readCurrentGitBranch(projectPath) || DEFAULT_BRANCH;
	const branchExists = await gitRefExists(projectPath, branchName);

	if (!branchExists) {
		emitLog(options.onLog, `Creating task branch ${branchName}...`);
		await runCommand('git', ['branch', branchName, baseBranch], {
			cwd: projectPath,
		});
	}

	let status = 'local';
	let pushedAt = null;
	let lastError = null;

	if (remoteUrl) {
		try {
			emitLog(options.onLog, `Pushing task branch ${branchName} to origin...`);
			const pushArgs =
				githubSettings.token && /github\.com[:/]/i.test(remoteUrl)
					? buildGitHubPushArguments('origin', branchName, githubSettings.token)
					: ['push', '-u', 'origin', branchName];

			await runCommand('git', pushArgs, {
				cwd: projectPath,
				env: {
					...process.env,
					GIT_TERMINAL_PROMPT: '0',
				},
			});
			status = 'pushed';
			pushedAt = new Date().toISOString();
		} catch (error) {
			lastError = error.message;
			emitLog(options.onLog, `Task branch push failed: ${error.message}`);
		}
	}

	return {
		name: branchName,
		baseBranch,
		remoteName: remoteUrl ? 'origin' : null,
		remoteUrl,
		status,
		createdAt: new Date().toISOString(),
		pushedAt,
		lastError,
	};
}

module.exports = {
	DEFAULT_BRANCH,
	buildTaskBranchName,
	createTaskBranch,
	initializeProjectRepository,
};
