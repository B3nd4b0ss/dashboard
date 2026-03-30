import { useEffect, useRef, useState } from 'react';
import {
	Link,
	useLocation,
	useNavigate,
	useSearchParams,
} from 'react-router-dom';
import axios from 'axios';
import AddRounded from '@mui/icons-material/AddRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import StorageRounded from '@mui/icons-material/StorageRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import StopRounded from '@mui/icons-material/StopRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import HubRounded from '@mui/icons-material/HubRounded';
import DnsRounded from '@mui/icons-material/DnsRounded';
import LanRounded from '@mui/icons-material/LanRounded';
import ConstructionRounded from '@mui/icons-material/ConstructionRounded';
import TerminalRounded from '@mui/icons-material/TerminalRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import CodeRounded from '@mui/icons-material/CodeRounded';
import { API_BASE_URL, DASHBOARD_API_PORT } from '../config/api';
import SurfaceSelect from './SurfaceSelect';
import {
	getProjectCommandLabel,
	getProjectLaunchLabel as getProjectLaunchLabelForDisplay,
	getProjectPrimaryEntry,
	getProjectRuntimeLabel,
	getProjectScaffold,
	hasOperationalMonitoring as hasProjectOperationalMonitoring,
} from '../utils/projectPresentation';
import {
	buildNextTextSearchParams,
	getSearchParamValue,
} from '../utils/searchParams';
import './Overview.css';

const API = API_BASE_URL;
const REFRESH_INTERVAL_MS = 7000;
const EMPTY_FORM = {
	name: '',
	projectLocation: '',
	frontendFamily: '',
	frontendPreset: '',
	frontend: '',
	backendRuntime: '',
	backendPreset: '',
	backend: '',
	databaseId: '',
	frontendPort: '',
	backendPort: '',
	description: '',
	version: '',
	javaPackageName: '',
	javaMainClass: '',
	javaVersion: '',
	javaGroupId: '',
	javaArtifactId: '',
	autoCreateRepo: null,
	visibility: '',
};
const DEFAULT_SYSTEM_SETTINGS = {
	github: {
		autoCreateRepo: true,
		owner: '',
		visibility: 'private',
		hasToken: false,
	},
};

const TEMPLATE_LABELS = {
	'vite-react': 'Vite + React',
	'vite-vanilla': 'Vite + Vanilla JS',
	'vite-react-ts': 'Vite + React TS',
	'vite-vue': 'Vite + Vue',
	'vite-vanilla-ts': 'Vite + Vanilla TS',
	'plain-html': 'HTML + CSS + JS',
	node: 'Node + Express',
	fastify: 'Node + Fastify',
	koa: 'Node + Koa',
	python: 'Python HTTP Server',
	'python-cli': 'Python CLI App',
	php: 'PHP Built-in Server',
	java: 'Java HTTP Server',
	'java-console': 'Java Console App',
	'java-maven': 'Java + Maven App',
};

const STATUS_FILTER_OPTIONS = [
	{
		value: 'all',
		label: 'All statuses',
		description: 'Show every project on the board.',
	},
	{
		value: 'running',
		label: 'Active',
		description: 'Only projects with live services.',
	},
	{
		value: 'partial',
		label: 'Attention',
		description: 'Projects with interrupted services.',
	},
	{
		value: 'stopped',
		label: 'Pending',
		description: 'Projects that are currently offline.',
	},
];

const REPOSITORY_VISIBILITY_OPTIONS = [
	{
		value: 'private',
		label: 'Private',
		description: 'Only invited collaborators can access the new repo.',
	},
	{
		value: 'public',
		label: 'Public',
		description: 'Anyone can view the repository once it is created.',
	},
];

const REPOSITORY_MODE_OPTIONS = [
	{
		value: 'github',
		label: 'Create on GitHub',
		description: 'Create a local repo, then connect and push it to GitHub.',
	},
	{
		value: 'local',
		label: 'Local only',
		description:
			'Initialize git locally and skip GitHub repository creation.',
	},
];

const FRONTEND_FAMILY_OPTIONS = [
	{
		value: '',
		label: 'No frontend',
		description: 'Skip the web app layer.',
		keywords: ['none', 'skip', 'no ui'],
	},
	{
		value: 'vite',
		label: 'Vite',
		description: 'Pick a Vite preset like React, Vue, or plain Vanilla.',
		keywords: ['vite react vue vanilla bundler'],
	},
	{
		value: 'static',
		label: 'HTML + CSS + JS',
		description:
			'Generate a simple static site starter with example files.',
		keywords: ['plain html css javascript static'],
	},
];

const FRONTEND_PRESET_OPTIONS = {
	vite: [
		{
			value: 'vite-vanilla',
			label: 'Vanilla JS',
			description:
				'Just Vite, no framework. This is the "only Vite" option.',
			keywords: ['vite only javascript vanilla plain'],
		},
		{
			value: 'vite-vanilla-ts',
			label: 'Vanilla TS',
			description: 'Vite with TypeScript and no UI framework.',
			keywords: ['vite typescript vanilla ts'],
		},
		{
			value: 'vite-react',
			label: 'React',
			description: 'Spin up a modern React frontend.',
			keywords: ['react jsx'],
		},
		{
			value: 'vite-react-ts',
			label: 'React TS',
			description: 'React with TypeScript and the Vite toolchain.',
			keywords: ['react typescript tsx'],
		},
		{
			value: 'vite-vue',
			label: 'Vue',
			description: 'Create a fast Vue frontend workspace.',
			keywords: ['vue'],
		},
	],
	static: [
		{
			value: 'plain-html',
			label: 'Static starter',
			description: 'Plain HTML, CSS, and JavaScript starter files.',
			keywords: ['html css javascript static'],
		},
	],
};

const BACKEND_PRESET_OPTIONS = {
	node: [
		{
			value: 'node',
			label: 'Express',
			description: 'Create an Express API service.',
			keywords: ['express node'],
		},
		{
			value: 'fastify',
			label: 'Fastify',
			description: 'A faster JSON API starter with Fastify.',
			keywords: ['fastify node'],
		},
		{
			value: 'koa',
			label: 'Koa',
			description: 'A minimal Koa backend for custom APIs.',
			keywords: ['koa node'],
		},
	],
	python: [
		{
			value: 'python-cli',
			label: 'CLI app',
			description:
				'Package-style Python workspace with pyproject metadata and tests.',
			keywords: ['python cli pyproject terminal app'],
		},
	],
	php: [
		{
			value: 'php',
			label: 'Built-in server',
			description:
				'Starter designed for php -S and a single index.php entrypoint.',
			keywords: ['php built-in'],
		},
	],
	java: [
		{
			value: 'java-console',
			label: 'Console app',
			description:
				'Plain Java app you can compile with javac and run with java.',
			keywords: ['java javac console cli'],
		},
		{
			value: 'java-maven',
			label: 'Maven app',
			description:
				'Real Maven project with pom.xml and a runnable main class.',
			keywords: ['java maven pom'],
		},
	],
};

const WEBSITE_BACKEND_RUNTIME_OPTIONS = [
	{
		value: '',
		label: 'No backend',
		description: 'Keep this website frontend-only for now.',
	},
	{
		value: 'node',
		label: 'Node.js',
		description:
			'Attach an Express, Fastify, or Koa service to the website.',
	},
	{
		value: 'php',
		label: 'PHP',
		description: 'Use PHP with the built-in local server.',
	},
	{
		value: 'python',
		label: 'Python HTTP',
		description: 'Use the Python HTTP starter as the website backend.',
	},
	{
		value: 'java',
		label: 'Java HTTP',
		description: 'Use the Java HTTP starter as the website backend.',
	},
];

const WEBSITE_BACKEND_PRESET_OPTIONS = {
	node: BACKEND_PRESET_OPTIONS.node,
	php: BACKEND_PRESET_OPTIONS.php,
	python: [
		{
			value: 'python',
			label: 'Standard HTTP server',
			description:
				'Zero-dependency starter using Python standard library modules.',
			keywords: ['http server python'],
		},
	],
	java: [
		{
			value: 'java',
			label: 'HTTP server',
			description:
				'Minimal Java server using the JDK HTTP server classes.',
			keywords: ['java jdk http'],
		},
	],
};

const CLI_BACKEND_TEMPLATES = ['python-cli', 'java-console', 'java-maven'];
const MANAGED_APP_BACKEND_TEMPLATES = ['python', 'php', 'java'];

const WEBSITE_FAMILY_OPTIONS = FRONTEND_FAMILY_OPTIONS.filter((option) =>
	Boolean(option.value),
);

const COMPOSER_FAST_LANES = [
	{
		value: 'website',
		label: 'Website',
		summary: 'Web app + optional backend',
		description:
			'React, Vue, Vanilla, or plain HTML starters with the backend runtime you want.',
		Icon: PublicRounded,
		tone: 'blue',
	},
	{
		value: 'python',
		label: 'Python',
		summary: 'CLI workspace',
		description:
			'Create a terminal-first Python project. Use Website when you want a Python HTTP backend.',
		Icon: TerminalRounded,
		tone: 'green',
	},
	{
		value: 'java',
		label: 'Java',
		summary: 'Console or Maven',
		description:
			'Create a Java console app or Maven project. Use Website when you want a Java HTTP backend.',
		Icon: RocketLaunchRounded,
		tone: 'amber',
	},
];

/**
 * Converts a raw runtime status into the badge label shown across the overview surfaces.
 *
 * @param {string} status - Raw project runtime status.
 * @returns {string} User-facing status label.
 */
function getStatusLabel(status) {
	switch (status) {
		case 'running':
			return 'Active';
		case 'partial':
			return 'Attention';
		default:
			return 'Pending';
	}
}

function getTemplateLabel(template) {
	return TEMPLATE_LABELS[template] || template || 'None';
}

function isCliBackendTemplate(template) {
	return CLI_BACKEND_TEMPLATES.includes(template);
}

function isManagedAppBackendTemplate(template) {
	return MANAGED_APP_BACKEND_TEMPLATES.includes(template);
}

function getFrontendFamily(template) {
	if (!template) {
		return '';
	}

	if (template === 'plain-html') {
		return 'static';
	}

	if (String(template).startsWith('vite-')) {
		return 'vite';
	}

	return '';
}

function getBackendRuntime(template) {
	if (!template) {
		return '';
	}

	if (['node', 'fastify', 'koa'].includes(template)) {
		return 'node';
	}

	if (['python', 'python-cli'].includes(template)) {
		return 'python';
	}

	if (['java', 'java-console', 'java-maven'].includes(template)) {
		return 'java';
	}

	return template;
}

function frontendTemplateRequiresPort(template) {
	return Boolean(template);
}

function backendTemplateRequiresPort(template) {
	return ['node', 'fastify', 'koa', 'python', 'php', 'java'].includes(
		template,
	);
}

function getFrontendPresetOptions(frontendFamily) {
	return FRONTEND_PRESET_OPTIONS[frontendFamily] || [];
}

function getBackendPresetOptions(backendRuntime, composerLane = '') {
	if (composerLane === 'website') {
		return WEBSITE_BACKEND_PRESET_OPTIONS[backendRuntime] || [];
	}

	return BACKEND_PRESET_OPTIONS[backendRuntime] || [];
}

function getDefaultFrontendPreset(frontendFamily) {
	return getFrontendPresetOptions(frontendFamily)[0]?.value || '';
}

function getDefaultBackendPreset(backendRuntime, composerLane = '') {
	return (
		getBackendPresetOptions(backendRuntime, composerLane)[0]?.value || ''
	);
}

function getSuggestedBackendPort(template) {
	switch (getBackendRuntime(template)) {
		case 'node':
			return String(DASHBOARD_API_PORT);
		case 'python':
		case 'php':
			return '8000';
		case 'java':
			return '8080';
		default:
			return '';
	}
}

/**
 * Normalizes the project composer form state used by the overview's creation flow.
 *
 * @param {object} [nextValue={}] - Partial composer form values.
 * @returns {object} Normalized composer form state.
 */
function normalizeComposerForm(nextValue = {}) {
	const frontend = nextValue.frontend || '';
	const backend = nextValue.backend || '';
	const frontendFamily =
		nextValue.frontendFamily || getFrontendFamily(frontend);
	const backendRuntime =
		nextValue.backendRuntime || getBackendRuntime(backend);
	const composerLane = frontend
		? 'website'
		: backendRuntime === 'python' || backendRuntime === 'java'
			? backendRuntime
			: '';
	const frontendPresetOptions = getFrontendPresetOptions(frontendFamily);
	const backendPresetOptions = getBackendPresetOptions(
		backendRuntime,
		composerLane,
	);
	const frontendPresetIsValid = frontendPresetOptions.some(
		(option) => option.value === nextValue.frontendPreset,
	);
	const backendPresetIsValid = backendPresetOptions.some(
		(option) => option.value === nextValue.backendPreset,
	);
	const frontendTemplateIsValid = frontendPresetOptions.some(
		(option) => option.value === frontend,
	);
	const backendTemplateIsValid = backendPresetOptions.some(
		(option) => option.value === backend,
	);
	const normalizedFrontendPreset = frontendFamily
		? frontendPresetIsValid
			? nextValue.frontendPreset
			: frontendTemplateIsValid
				? frontend
				: getDefaultFrontendPreset(frontendFamily)
		: '';
	const normalizedBackendPreset = backendRuntime
		? backendPresetIsValid
			? nextValue.backendPreset
			: backendTemplateIsValid
				? backend
				: getDefaultBackendPreset(backendRuntime, composerLane)
		: '';

	return {
		...EMPTY_FORM,
		...nextValue,
		autoCreateRepo:
			typeof nextValue.autoCreateRepo === 'boolean'
				? nextValue.autoCreateRepo
				: null,
		visibility:
			nextValue.visibility === 'public' ||
			nextValue.visibility === 'private'
				? nextValue.visibility
				: '',
		frontendFamily,
		frontendPreset: normalizedFrontendPreset,
		frontend: normalizedFrontendPreset,
		backendRuntime,
		backendPreset: normalizedBackendPreset,
		backend: normalizedBackendPreset,
	};
}

/**
 * Builds the normalized search text used to filter overview project cards.
 *
 * @param {object} project - Project record returned by the API.
 * @returns {string} Lower-case searchable text blob.
 */
function getProjectSearchText(project) {
	return [
		project.name,
		project.frontend,
		project.backend,
		getTemplateLabel(project.frontend),
		getTemplateLabel(project.backend),
		project.database?.name,
		project.database?.type,
		project.repository?.owner,
		project.repository?.name,
		project.repository?.status,
		project.status,
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
}

function getPrimaryProjectUrl(project) {
	return project.frontendUrl || project.backendUrl || null;
}

function getProjectProgress(project) {
	if (project.taskSummary?.total > 0) {
		return project.taskSummary.progressPercentage;
	}

	const expected = project.runtime?.expectedServiceCount || 0;
	const active = project.runtime?.activeServiceCount || 0;

	if (expected > 0) {
		return Math.max(18, Math.round((active / expected) * 100));
	}

	if (project.status === 'running') {
		return 92;
	}

	if (project.status === 'partial') {
		return 54;
	}

	return 24;
}

function getProjectCrew(project) {
	const crew = [];

	if (project.frontend) {
		crew.push({ label: 'UI', accent: 'blue' });
	}

	if (project.backend) {
		if (isCliBackendTemplate(project.backend)) {
			crew.push({ label: 'CLI', accent: 'slate' });
		} else if (isManagedAppBackendTemplate(project.backend)) {
			crew.push({ label: 'APP', accent: 'green' });
		} else {
			crew.push({ label: 'API', accent: 'green' });
		}
	}

	if (project.database) {
		crew.push({ label: 'DB', accent: 'amber' });
	}

	if (crew.length === 0) {
		crew.push({ label: 'OPS', accent: 'slate' });
	}

	return crew;
}

function getProjectDescription(project) {
	return getProjectScaffold(project).description;
}

function getProjectVersion(project) {
	return getProjectScaffold(project).version;
}

function getProjectSummary(project) {
	return [
		getProjectLaunchLabelForDisplay(project),
		getProjectVersion(project),
		project.database ? `${project.database.type} linked` : 'No database',
		project.taskSummary?.total
			? `${project.taskSummary.total} tasks`
			: 'No tasks yet',
	]
		.filter(Boolean)
		.join(' | ');
}

function getBackendChipLabel(template) {
	if (isCliBackendTemplate(template)) {
		return 'CLI';
	}

	if (isManagedAppBackendTemplate(template)) {
		return 'Service';
	}

	return template ? 'Backend' : 'None';
}

function getBackendPortLabel(template) {
	return isManagedAppBackendTemplate(template) ? 'Service' : 'API';
}

function getComposerLaunchLabel(frontend, backend) {
	const hasFrontend = frontendTemplateRequiresPort(frontend);
	const hasManagedBackend = backendTemplateRequiresPort(backend);
	const hasTerminalBackend = Boolean(backend && !hasManagedBackend);

	if (hasFrontend && hasManagedBackend) {
		return 'Web + service';
	}

	if (hasFrontend) {
		return 'Frontend app';
	}

	if (hasManagedBackend) {
		return 'Managed service';
	}

	if (hasTerminalBackend) {
		return 'Editor terminal';
	}

	return 'Custom workspace';
}

function getComposerLaneFromForm(form) {
	if (form.frontend) {
		return 'website';
	}

	const runtime = form.backendRuntime || getBackendRuntime(form.backend);
	if (runtime === 'python' || runtime === 'java') {
		return runtime;
	}

	return '';
}

/**
 * Builds a preset composer draft for one of the overview's fast-lane creation options.
 *
 * @param {string} lane - Fast-lane identifier selected by the user.
 * @param {object} [previous=EMPTY_FORM] - Previous composer form state used for carry-over values.
 * @returns {object} Pre-filled composer form state.
 */
function buildFastLaneDraft(lane, previous = EMPTY_FORM) {
	const baseDraft = {
		...EMPTY_FORM,
		name: previous.name,
		projectLocation: previous.projectLocation,
		databaseId: previous.databaseId,
		description: previous.description,
		version: previous.version,
		javaPackageName: previous.javaPackageName,
		javaMainClass: previous.javaMainClass,
		javaVersion: previous.javaVersion,
		javaGroupId: previous.javaGroupId,
		javaArtifactId: previous.javaArtifactId,
		autoCreateRepo: previous.autoCreateRepo,
		visibility: previous.visibility,
	};

	if (lane === 'website') {
		const previousWebsiteBackendRuntime =
			getComposerLaneFromForm(previous) === 'website'
				? getBackendRuntime(previous.backend)
				: '';
		const previousWebsiteBackendOptions = getBackendPresetOptions(
			previousWebsiteBackendRuntime,
			'website',
		);
		const hasCompatibleWebsiteBackend = previousWebsiteBackendOptions.some(
			(option) => option.value === previous.backend,
		);
		const nextFrontendFamily =
			getComposerLaneFromForm(previous) === 'website' &&
			previous.frontendFamily
				? previous.frontendFamily
				: 'vite';
		const nextFrontend =
			getComposerLaneFromForm(previous) === 'website' && previous.frontend
				? previous.frontend
				: getDefaultFrontendPreset(nextFrontendFamily);

		return {
			...baseDraft,
			frontendFamily: nextFrontendFamily,
			frontendPreset: nextFrontend,
			frontend: nextFrontend,
			frontendPort: previous.frontendPort || '3000',
			backendRuntime: hasCompatibleWebsiteBackend
				? previousWebsiteBackendRuntime
				: '',
			backendPreset: hasCompatibleWebsiteBackend ? previous.backend : '',
			backend: hasCompatibleWebsiteBackend ? previous.backend : '',
			backendPort: hasCompatibleWebsiteBackend
				? previous.backendPort ||
					getSuggestedBackendPort(previous.backend)
				: '',
		};
	}

	if (lane === 'python') {
		const nextBackend =
			getBackendRuntime(previous.backend) === 'python' && previous.backend
				? previous.backend
				: 'python-cli';

		return {
			...baseDraft,
			backendRuntime: 'python',
			backendPreset: nextBackend,
			backend: nextBackend,
			backendPort: backendTemplateRequiresPort(nextBackend)
				? previous.backendPort || '8000'
				: '',
		};
	}

	if (lane === 'java') {
		const nextBackend =
			getBackendRuntime(previous.backend) === 'java' && previous.backend
				? previous.backend
				: 'java-console';

		return {
			...baseDraft,
			backendRuntime: 'java',
			backendPreset: nextBackend,
			backend: nextBackend,
			backendPort: backendTemplateRequiresPort(nextBackend)
				? previous.backendPort || '8080'
				: '',
		};
	}

	return baseDraft;
}

function getFastLaneTemplateLabel(lane, form) {
	if (lane === 'website') {
		const websiteLabel = form.frontend
			? getTemplateLabel(form.frontend)
			: 'Choose a website starter';

		return form.backend
			? `${websiteLabel} + ${getTemplateLabel(form.backend)}`
			: websiteLabel;
	}

	if (lane === 'python' || lane === 'java') {
		return form.backend
			? getTemplateLabel(form.backend)
			: 'Choose a project style';
	}

	return 'Choose Website, Python, or Java';
}

function slugifyComposerToken(value, fallback = 'workspace-app') {
	const normalized = String(value || fallback)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return normalized || fallback;
}

function getComposerVersion(form) {
	return form.version || '0.1.0';
}

function getComposerJavaGroupId(form) {
	return form.javaGroupId || 'com.dashboard';
}

function getComposerJavaPackageName(form) {
	return form.javaPackageName || `${getComposerJavaGroupId(form)}.app`;
}

function getComposerJavaMainClass(form) {
	return form.javaMainClass || 'App';
}

function getComposerJavaVersion(form) {
	return form.javaVersion || '11';
}

function getComposerJavaArtifactId(form) {
	return (
		form.javaArtifactId ||
		slugifyComposerToken(form.name || 'workspace-app')
	);
}

function getComposerJavaExecClass(form) {
	return `${getComposerJavaPackageName(form)}.${getComposerJavaMainClass(form)}`;
}

function getComposerJavaSourcePath(form) {
	const basePath = form.backend === 'java-maven' ? 'src/main/java' : 'src';
	return `${basePath}/${getComposerJavaPackageName(form).replace(/\./g, '/')}/${getComposerJavaMainClass(form)}.java`;
}

function getComposerProjectLocationLabel(form) {
	const location = String(form.projectLocation || '').trim();
	return location || 'Default dashboard projects folder';
}

function getComposerProjectPathPreview(form) {
	const projectName = String(form.name || '').trim() || 'project-name';
	const location = String(form.projectLocation || '').trim();

	if (!location) {
		return `Default dashboard projects folder -> ${projectName}`;
	}

	const separator =
		location.includes('/') && !location.includes('\\') ? '/' : '\\';

	return `${location.replace(/[\\/]+$/, '')}${separator}${projectName}`;
}

/**
 * Broadcasts project lifecycle events so other surfaces can refresh optimistically.
 *
 * @param {string} projectName - Project name associated with the action.
 * @param {string} action - Action identifier such as `start` or `stop`.
 * @returns {void}
 */
function broadcastProjectAction(projectName, action) {
	window.dispatchEvent(
		new CustomEvent('dashboard:project-action', {
			detail: { projectName, action },
		}),
	);
}

/**
 * Renders the main projects overview and composer surface.
 *
 * @param {{mode?: 'board' | 'composer'}} props - Component props.
 * @returns {JSX.Element} Overview screen.
 */
function Overview({ mode = 'board' }) {
	const isComposerPage = mode === 'composer';
	const location = useLocation();
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const [projects, setProjects] = useState([]);
	const [databases, setDatabases] = useState([]);
	const query = getSearchParamValue(searchParams, 'q');
	const [statusFilter, setStatusFilter] = useState('all');
	const [form, setForm] = useState(() => normalizeComposerForm(EMPTY_FORM));
	const [systemSettings, setSystemSettings] = useState(
		DEFAULT_SYSTEM_SETTINGS,
	);
	const [selectedLane, setSelectedLane] = useState(() =>
		getComposerLaneFromForm(normalizeComposerForm(EMPTY_FORM)),
	);
	const [showTerminal, setShowTerminal] = useState(false);
	const [terminalOutput, setTerminalOutput] = useState([]);
	const [isCreating, setIsCreating] = useState(false);
	const [progress, setProgress] = useState(0);
	const [folderPickerBusy, setFolderPickerBusy] = useState(false);
	const [dashboardError, setDashboardError] = useState('');
	const [composerMessage, setComposerMessage] = useState('');
	const [pendingAction, setPendingAction] = useState('');
	const outputEndRef = useRef(null);
	const updateForm = (nextValue) => {
		setForm((previous) =>
			normalizeComposerForm(
				typeof nextValue === 'function'
					? nextValue(previous)
					: nextValue,
			),
		);
	};
	const handleQueryChange = (event) => {
		setSearchParams(
			buildNextTextSearchParams(searchParams, 'q', event.target.value),
			{ replace: true },
		);
	};

	const loadProjects = async () => {
		const res = await axios.get(`${API}/projects`);
		setProjects(res.data);
	};

	const loadDatabases = async () => {
		const res = await axios.get(`${API}/databases`);
		setDatabases(res.data);
	};

	const loadSystemSettings = async () => {
		const res = await axios.get(`${API}/system/settings`);
		setSystemSettings(res.data || DEFAULT_SYSTEM_SETTINGS);
	};

	const refreshDashboard = async ({ silent = false } = {}) => {
		try {
			await Promise.all([
				loadProjects(),
				loadDatabases(),
				loadSystemSettings(),
			]);
			setDashboardError('');
		} catch (error) {
			if (!silent) {
				setDashboardError(
					error.response?.data?.error ||
						'Failed to load project data. Make sure the backend is running.',
				);
			}
		}
	};

	useEffect(() => {
		refreshDashboard();

		const intervalId = window.setInterval(() => {
			refreshDashboard({ silent: true });
		}, REFRESH_INTERVAL_MS);

		return () => window.clearInterval(intervalId);
	}, []);

	useEffect(() => {
		outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [terminalOutput]);

	useEffect(() => {
		const returnedDraft = location.state?.projectComposerDraft;
		const returnedMessage = location.state?.composerMessage;

		if (!returnedDraft && !returnedMessage) {
			return;
		}

		if (returnedDraft) {
			const normalizedDraft = normalizeComposerForm(returnedDraft);
			setForm(normalizedDraft);
			setSelectedLane(getComposerLaneFromForm(normalizedDraft));
		}

		if (returnedMessage) {
			setComposerMessage(returnedMessage);
		}

		navigate(location.pathname, { replace: true, state: null });
	}, [location.pathname, location.state, navigate]);

	const updateProgressFromLog = (message) => {
		if (message.includes('Creating') && message.includes('frontend')) {
			setProgress((previous) => Math.max(previous, 8));
		} else if (
			message.includes('Creating Vite project') ||
			message.includes('Writing plain HTML starter files')
		) {
			setProgress(10);
		} else if (
			message.includes('Installing npm dependencies') ||
			message.includes('Installing frontend dependencies')
		) {
			setProgress((previous) => Math.max(previous, 28));
		} else if (message.includes('Frontend created')) {
			setProgress(55);
		} else if (
			message.includes('Creating') &&
			message.includes('backend')
		) {
			setProgress(68);
		} else if (message.includes('Backend starter files are ready')) {
			setProgress((previous) => Math.max(previous, 86));
		} else if (message.includes('Installing backend dependencies')) {
			setProgress((previous) => Math.max(previous, 82));
		} else if (message.includes('Backend created')) {
			setProgress(90);
		} else if (message.includes('Initializing git repository')) {
			setProgress((previous) => Math.max(previous, 94));
		} else if (message.includes('Creating first commit')) {
			setProgress((previous) => Math.max(previous, 96));
		} else if (message.includes('Pushing first commit to GitHub')) {
			setProgress((previous) => Math.max(previous, 98));
		} else if (message.includes('GitHub remote connected')) {
			setProgress(100);
		} else if (message.includes('Project created successfully')) {
			setProgress(100);
		}
	};

	const resetForm = () => {
		setForm(normalizeComposerForm(EMPTY_FORM));
		setSelectedLane('');
		setComposerMessage('');
	};

	const openDatabaseCreation = () => {
		setComposerMessage('');
		navigate('/databases', {
			state: {
				fromProjectComposer: true,
				projectComposerDraft: form,
				returnToProjectComposerPath: '/composer',
			},
		});
	};

	const browseComposerProjectLocation = async () => {
		setFolderPickerBusy(true);

		try {
			const response = await axios.post(`${API}/system/pick-folder`, {
				initialPath: form.projectLocation,
				title: 'Choose where the project should be created',
			});

			if (!response.data?.canceled && response.data?.path) {
				updateForm((previous) => ({
					...previous,
					projectLocation: response.data.path,
				}));
			}
		} catch (error) {
			alert(
				error.response?.data?.error || 'Failed to open folder picker.',
			);
		} finally {
			setFolderPickerBusy(false);
		}
	};

	const createProject = async () => {
		const composerLane = selectedLane || getComposerLaneFromForm(form);
		const frontendNeedsPort = frontendTemplateRequiresPort(form.frontend);
		const backendNeedsPort = backendTemplateRequiresPort(form.backend);
		const repositoryAutoCreate =
			typeof form.autoCreateRepo === 'boolean'
				? form.autoCreateRepo
				: githubSettings.autoCreateRepo;
		const repositoryVisibility =
			form.visibility === 'public' || form.visibility === 'private'
				? form.visibility
				: githubSettings.visibility === 'public'
					? 'public'
					: 'private';

		if (!form.name.trim()) {
			alert('Please enter a project name.');
			return;
		}

		if (!composerLane) {
			alert('Choose Website, Python, or Java first.');
			return;
		}

		if (composerLane === 'website' && !form.frontend) {
			alert('Choose a website starter.');
			return;
		}

		if (
			(composerLane === 'python' || composerLane === 'java') &&
			!form.backend
		) {
			alert('Choose a project style for this lane.');
			return;
		}

		if (frontendNeedsPort && !form.frontendPort) {
			alert('Please enter a frontend port.');
			return;
		}

		if (backendNeedsPort && !form.backendPort) {
			alert('Please enter a backend port.');
			return;
		}

		if (
			frontendNeedsPort &&
			backendNeedsPort &&
			form.frontendPort === form.backendPort
		) {
			alert('Frontend and backend ports must be different.');
			return;
		}

		setShowTerminal(true);
		setIsCreating(true);
		setProgress(0);
		setTerminalOutput([
			{
				type: 'log',
				message: 'Starting project creation...',
				timestamp: new Date().toLocaleTimeString(),
			},
		]);

		try {
			const response = await fetch(`${API}/projects/create-stream`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...form,
					autoCreateRepo: repositoryAutoCreate,
					visibility: repositoryVisibility,
				}),
			});

			if (!response.ok) {
				const errorData = await response
					.json()
					.catch(() => ({ error: 'Project creation failed.' }));
				throw new Error(errorData.error || 'Project creation failed.');
			}

			if (!response.body) {
				throw new Error('Streaming output is unavailable.');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				const chunk = decoder.decode(value, { stream: true });
				for (const line of chunk.split('\n')) {
					if (!line.startsWith('data: ')) {
						continue;
					}

					const data = JSON.parse(line.slice(6));
					const entry = {
						...data,
						timestamp: new Date().toLocaleTimeString(),
					};

					setTerminalOutput((previous) => [...previous, entry]);

					if (data.type === 'log') {
						updateProgressFromLog(data.message);
					}

					if (data.type === 'complete') {
						setProgress(100);
						setIsCreating(false);
						const createdProjectName =
							data.project?.name || form.name;
						resetForm();
						await refreshDashboard({ silent: true });
						setShowTerminal(false);
						setTerminalOutput([]);

						if (createdProjectName) {
							navigate(
								`/projects/${encodeURIComponent(createdProjectName)}`,
							);
						}
					}

					if (data.type === 'error') {
						setIsCreating(false);
					}
				}
			}
		} catch (error) {
			setTerminalOutput((previous) => [
				...previous,
				{
					type: 'error',
					message: `Error: ${error.message}`,
					timestamp: new Date().toLocaleTimeString(),
				},
			]);
			setIsCreating(false);
		}

		await refreshDashboard({ silent: true });
	};

	const runProjectAction = async (name, action, request) => {
		setPendingAction(`${action}:${name}`);
		broadcastProjectAction(name, action);

		try {
			await request();
			await refreshDashboard({ silent: true });
		} catch (error) {
			alert(error.response?.data?.error || error.message);
		} finally {
			setPendingAction('');
		}
	};

	const startProject = async (name) => {
		await runProjectAction(name, 'start', () =>
			axios.post(`${API}/projects/${encodeURIComponent(name)}/start`),
		);
	};

	const stopProject = async (name) => {
		await runProjectAction(name, 'stop', () =>
			axios.post(`${API}/projects/${encodeURIComponent(name)}/stop`),
		);
	};

	const deleteProject = async (project) => {
		const name = project.name;
		if (!window.confirm(`Delete "${name}" and its local files?`)) {
			return;
		}

		const hasGitHubRepository =
			project.repository?.provider === 'github' &&
			Boolean(project.repository?.owner) &&
			Boolean(project.repository?.name);
		let deleteRemote = false;

		if (hasGitHubRepository) {
			deleteRemote = window.confirm(
				`Also delete ${project.repository.owner}/${project.repository.name} from GitHub?\n\nChoose "Cancel" here if you only want to remove the local project.`,
			);
		}

		await runProjectAction(name, 'delete', () =>
			axios.delete(`${API}/projects/${encodeURIComponent(name)}/delete`, {
				params: { deleteRemote },
			}),
		);
	};

	const closeTerminal = () => {
		if (isCreating) {
			return;
		}

		setShowTerminal(false);
		setTerminalOutput([]);
	};

	const visibleProjects = [...projects]
		.filter((project) => {
			const matchesQuery = getProjectSearchText(project).includes(
				query.trim().toLowerCase(),
			);
			const matchesStatus =
				statusFilter === 'all' || project.status === statusFilter;

			return matchesQuery && matchesStatus;
		})
		.sort((left, right) => {
			const statusOrder = { running: 0, partial: 1, stopped: 2 };
			const leftOrder = statusOrder[left.status] ?? 3;
			const rightOrder = statusOrder[right.status] ?? 3;

			if (leftOrder !== rightOrder) {
				return leftOrder - rightOrder;
			}

			return left.name.localeCompare(right.name);
		});

	const activeProjects = projects.filter(
		(project) => project.status !== 'stopped',
	);
	const totalTaskCount = projects.reduce(
		(total, project) => total + (project.taskSummary?.total || 0),
		0,
	);
	const websiteProjectCount = projects.filter(
		(project) => project.frontend,
	).length;
	const terminalProjectCount = projects.filter((project) =>
		Boolean(project.backend && !hasProjectOperationalMonitoring(project)),
	).length;
	const linkedDatabaseCount = projects.filter((project) =>
		Boolean(project.databaseId),
	).length;
	const databaseOptions = [
		{
			value: '',
			label: 'No database',
			description: 'Keep this project app-only for now.',
		},
		...databases.map((database) => ({
			value: database.id,
			label: database.name,
			description: `${database.type} on port ${database.port}`,
		})),
	];
	const composerLane = selectedLane || getComposerLaneFromForm(form);
	const frontendPresetOptions = getFrontendPresetOptions(form.frontendFamily);
	const backendPresetOptions = getBackendPresetOptions(
		form.backendRuntime,
		composerLane,
	);
	const selectedFrontendPreset =
		frontendPresetOptions.find(
			(option) => option.value === form.frontendPreset,
		) || null;
	const selectedBackendPreset =
		backendPresetOptions.find(
			(option) => option.value === form.backendPreset,
		) || null;
	const showFrontendPresetSelect = frontendPresetOptions.length > 1;
	const showBackendPresetSelect = backendPresetOptions.length > 1;
	const selectedLaneOption =
		COMPOSER_FAST_LANES.find((lane) => lane.value === composerLane) || null;
	const backendPortRequired = backendTemplateRequiresPort(form.backend);
	const composerLaunchLabel = getComposerLaunchLabel(
		form.frontend,
		form.backend,
	);
	const selectedBackendRuntime = getBackendRuntime(form.backend);
	const composerVersion = getComposerVersion(form);
	const composerJavaGroupId = getComposerJavaGroupId(form);
	const composerJavaPackageName = getComposerJavaPackageName(form);
	const composerJavaMainClass = getComposerJavaMainClass(form);
	const composerJavaVersion = getComposerJavaVersion(form);
	const composerJavaArtifactId = getComposerJavaArtifactId(form);
	const composerJavaExecClass = getComposerJavaExecClass(form);
	const composerJavaSourcePath = getComposerJavaSourcePath(form);
	const composerProjectLocationLabel = getComposerProjectLocationLabel(form);
	const composerProjectPathPreview = getComposerProjectPathPreview(form);
	const githubSettings =
		systemSettings.github || DEFAULT_SYSTEM_SETTINGS.github;
	const composerAutoCreateRepo =
		typeof form.autoCreateRepo === 'boolean'
			? form.autoCreateRepo
			: githubSettings.autoCreateRepo;
	const githubRepositoryName = slugifyComposerToken(
		form.name || 'project-name',
	);
	const githubOwnerLabel = githubSettings.owner || 'token owner';
	const githubTokenReady = githubSettings.hasToken;
	const githubPublishEnabledForProject =
		composerAutoCreateRepo && githubTokenReady;
	const composerRepositoryVisibility =
		form.visibility === 'public' || form.visibility === 'private'
			? form.visibility
			: githubSettings.visibility === 'public'
				? 'public'
				: 'private';
	const githubPublishTarget = githubPublishEnabledForProject
		? `${githubOwnerLabel}/${githubRepositoryName}`
		: composerAutoCreateRepo
			? 'Add a saved token in Settings'
			: 'Auto-publish is off';
	const selectedWebsiteFamily =
		WEBSITE_FAMILY_OPTIONS.find(
			(option) => option.value === form.frontendFamily,
		) || null;
	const handleFrontendFamilyChange = (nextValue) => {
		updateForm((previous) => {
			const compatibleOptions = getFrontendPresetOptions(nextValue);
			const currentPresetStillValid = compatibleOptions.some(
				(option) => option.value === previous.frontendPreset,
			);
			const nextPreset = nextValue
				? currentPresetStillValid
					? previous.frontendPreset
					: getDefaultFrontendPreset(nextValue)
				: '';

			return {
				...previous,
				frontendFamily: nextValue,
				frontendPreset: nextPreset,
				frontend: nextPreset,
				frontendPort: nextValue ? previous.frontendPort : '',
			};
		});
	};
	const handleFrontendPresetChange = (nextValue) => {
		updateForm((previous) => ({
			...previous,
			frontendPreset: nextValue,
			frontend: nextValue,
		}));
	};
	const handleWebsiteBackendRuntimeChange = (nextValue) => {
		updateForm((previous) => {
			const compatibleOptions = getBackendPresetOptions(
				nextValue,
				'website',
			);
			const currentPresetStillValid = compatibleOptions.some(
				(option) => option.value === previous.backendPreset,
			);
			const nextPreset = nextValue
				? currentPresetStillValid
					? previous.backendPreset
					: getDefaultBackendPreset(nextValue, 'website')
				: '';

			return {
				...previous,
				backendRuntime: nextValue,
				backendPreset: nextPreset,
				backend: nextPreset,
				backendPort: nextPreset
					? previous.backendPort ||
						getSuggestedBackendPort(nextPreset)
					: '',
			};
		});
	};
	const handleBackendPresetChange = (nextValue) => {
		updateForm((previous) => ({
			...previous,
			backendPreset: nextValue,
			backend: nextValue,
			backendPort: backendTemplateRequiresPort(nextValue)
				? previous.backendPort || getSuggestedBackendPort(nextValue)
				: '',
		}));
	};
	const applyFastLane = (lane) => {
		setSelectedLane(lane.value);
		updateForm((previous) => buildFastLaneDraft(lane.value, previous));
		setComposerMessage(
			`${lane.label} lane loaded. The composer now shows only the settings you can change for this project type.`,
		);
	};

	return (
		<div className='projects-page'>
			{showTerminal && (
				<div className='terminal-modal' onClick={closeTerminal}>
					<div
						className='terminal-container'
						onClick={(event) => event.stopPropagation()}>
						<div className='terminal-header'>
							<div>
								<p className='terminal-label'>Provisioning</p>
								<h3>Project creation log</h3>
							</div>
							<button
								onClick={closeTerminal}
								disabled={isCreating}>
								Close
							</button>
						</div>
						<div className='progress-bar-container'>
							<div
								className='progress-bar'
								style={{ width: `${progress}%` }}
							/>
						</div>
						<div className='terminal-content'>
							{terminalOutput.map((entry, index) => (
								<div
									key={`${entry.timestamp}-${index}`}
									className={`terminal-line ${entry.type}`}>
									<span className='timestamp'>
										[{entry.timestamp}]
									</span>
									{entry.message}
								</div>
							))}
							{isCreating && <div className='terminal-cursor' />}
							<div ref={outputEndRef} />
						</div>
					</div>
				</div>
			)}

			{!isComposerPage ? (
				<>
					<section className='projects-toolbar-surface'>
						<div>
							<span className='section-tag'>Project Board</span>
							<h2>
								Launch, track, and shape websites, APIs, Java
								apps, and Python workspaces from one clean
								board.
							</h2>
							<p>
								The project surface keeps web apps, backend
								services, CLI workspaces, runtime health, and
								linked databases in one place without losing the
								real dev actions underneath.
							</p>
						</div>

						<div className='projects-toolbar-actions'>
							<button
								type='button'
								className='secondary-action'
								onClick={() => refreshDashboard()}>
								<RefreshRounded fontSize='small' />
								Refresh
							</button>
							<button
								type='button'
								className='primary-action'
								onClick={() => navigate('/composer')}>
								<AddRounded fontSize='small' />
								Create project
							</button>
						</div>
					</section>

					<section className='project-meta-strip'>
						<article className='meta-strip-card'>
							<div className='meta-strip-icon blue'>
								<FolderRounded />
							</div>
							<div>
								<span>Total projects</span>
								<strong>{projects.length}</strong>
							</div>
						</article>
						<article className='meta-strip-card'>
							<div className='meta-strip-icon green'>
								<RocketLaunchRounded />
							</div>
							<div>
								<span>Live services</span>
								<strong>{activeProjects.length}</strong>
							</div>
						</article>
						<article className='meta-strip-card'>
							<div className='meta-strip-icon blue'>
								<PublicRounded />
							</div>
							<div>
								<span>Web workspaces</span>
								<strong>{websiteProjectCount}</strong>
							</div>
						</article>
						<article className='meta-strip-card'>
							<div className='meta-strip-icon amber'>
								<TerminalRounded />
							</div>
							<div>
								<span>Terminal-first apps</span>
								<strong>{terminalProjectCount}</strong>
							</div>
						</article>
						<article className='meta-strip-card'>
							<div className='meta-strip-icon amber'>
								<StorageRounded />
							</div>
							<div>
								<span>Linked databases</span>
								<strong>{linkedDatabaseCount}</strong>
							</div>
						</article>
						<article className='meta-strip-card'>
							<div className='meta-strip-icon amber'>
								<TaskAltRounded />
							</div>
							<div>
								<span>Tracked tasks</span>
								<strong>{totalTaskCount}</strong>
							</div>
						</article>
					</section>
				</>
			) : (
				<section className='projects-toolbar-surface composer-route-hero'>
					<div>
						<span className='section-tag'>Project Composer</span>
						<h2>
							Build the next workspace in its own focused flow.
						</h2>
						<p>
							Choose Website, Python, or Java, shape the
							compatible starter, and return to the project board
							when the draft is ready.
						</p>
					</div>

					<div className='projects-toolbar-actions'>
						<Link to='/projects' className='secondary-link'>
							<FolderRounded fontSize='small' />
							Back to projects
						</Link>
					</div>
				</section>
			)}

			{dashboardError && (
				<div className='panel-error'>{dashboardError}</div>
			)}
			{composerMessage && (
				<div className='panel-success'>{composerMessage}</div>
			)}

			{!isComposerPage && (
				<section className='project-control-band'>
					<label className='board-search'>
						<SearchRounded fontSize='small' />
						<input
							className='search-input'
							placeholder='Search projects, runtimes, or databases'
							value={query}
							onChange={handleQueryChange}
						/>
					</label>

					<div className='board-actions'>
						<SurfaceSelect
							value={statusFilter}
							onChange={setStatusFilter}
							options={STATUS_FILTER_OPTIONS}
							variant='compact'
							align='right'
							className='board-surface-select'
						/>

						<Link to='/databases' className='ghost-link'>
							<StorageRounded fontSize='small' />
							Open databases
						</Link>
					</div>
				</section>
			)}

			{isComposerPage && (
				<section className='composer-panel'>
					<div className='panel-header panel-header-spread'>
						<div>
							<span className='section-tag muted'>Composer</span>
							<h3>Create a new project</h3>
							<p>
								Create websites, APIs, CLI tools, and Java or
								Python workspaces without leaving the board.
							</p>
						</div>
						<div className='composer-note'>
							<ConstructionRounded fontSize='small' />
							<span>
								System ports and live listeners are checked
								automatically.
							</span>
						</div>
					</div>

					<div className='composer-flow'>
						<section className='composer-stage-card composer-stage-card-name'>
							<div className='composer-card-heading'>
								<span className='composer-step-badge'>
									Step 1
								</span>
								<div>
									<strong>Name the workspace</strong>
									<p>
										Start with a clean project name.
										Everything else builds on this base.
									</p>
								</div>
							</div>

							<div className='composer-card-fields'>
								<label className='field-group'>
									<span>Project name</span>
									<input
										value={form.name}
										onChange={(event) =>
											updateForm((previous) => ({
												...previous,
												name: event.target.value,
											}))
										}
										placeholder='project-name'
									/>
								</label>

								<label className='field-group'>
									<div className='field-label-row'>
										<span>Create in folder</span>
										<button
											type='button'
											className='inline-field-action'
											onClick={
												browseComposerProjectLocation
											}
											disabled={folderPickerBusy}>
											<FolderRounded fontSize='inherit' />
											{folderPickerBusy
												? 'Opening...'
												: 'Browse'}
										</button>
									</div>
									<input
										value={form.projectLocation}
										onChange={(event) =>
											updateForm((previous) => ({
												...previous,
												projectLocation:
													event.target.value,
											}))
										}
										placeholder='Leave blank for the default dashboard projects folder'
									/>
								</label>

								<div className='field-group field-wide'>
									<span>Project folder preview</span>
									<div className='composer-selection-preview'>
										<strong>
											{composerProjectPathPreview}
										</strong>
										<span>
											Type an absolute path or a path
											relative to the dashboard projects
											folder. Clearing this field uses the
											default location.
										</span>
									</div>
								</div>
							</div>
						</section>

						<section className='composer-stage-card composer-stage-card-blueprints'>
							<div className='composer-card-heading'>
								<span className='composer-step-badge'>
									Fast lane
								</span>
								<div>
									<strong>Choose the project family</strong>
									<p>
										Start with one lane, then the composer
										will narrow itself to the controls that
										fit that type of project.
									</p>
								</div>
							</div>

							<div className='composer-blueprint-grid'>
								{COMPOSER_FAST_LANES.map((lane) => {
									const LaneIcon = lane.Icon;
									const isActive =
										composerLane === lane.value;

									return (
										<button
											key={lane.value}
											type='button'
											className={`composer-blueprint-card tone-${lane.tone} ${
												isActive ? 'active' : ''
											}`}
											onClick={() => applyFastLane(lane)}>
											<span
												className={`composer-blueprint-icon ${lane.tone}`}>
												<LaneIcon fontSize='inherit' />
											</span>
											<div className='composer-blueprint-copy'>
												<strong>{lane.label}</strong>
												<span>{lane.summary}</span>
												<p>{lane.description}</p>
											</div>
										</button>
									);
								})}
							</div>

							<p className='field-help'>
								Website keeps website starters together and now
								lets you attach an optional backend again.
								Python and Java stay focused on their standalone
								app templates.
							</p>
						</section>

						<div className='composer-stage-grid'>
							<section className='composer-stage-card composer-stage-card-frontend'>
								<div className='composer-card-heading'>
									<span className='composer-step-badge'>
										Step 2
									</span>
									<div>
										<strong>
											{composerLane === 'website'
												? 'Shape the website'
												: composerLane === 'python'
													? 'Shape the Python project'
													: composerLane === 'java'
														? 'Shape the Java project'
														: 'Open a lane to continue'}
										</strong>
										<p>
											{composerLane === 'website'
												? 'Pick the website stack, add an optional backend, and choose the ports you want.'
												: composerLane === 'python'
													? 'Choose the standalone Python project starter for terminal-first work.'
													: composerLane === 'java'
														? 'Choose whether this Java workspace starts as a console app or Maven project.'
														: 'Select Website, Python, or Java above and this card will switch to the right controls.'}
										</p>
									</div>
								</div>

								<div className='composer-card-fields'>
									{composerLane === 'website' ? (
										<>
											<div className='field-group'>
												<span>Website type</span>
												<SurfaceSelect
													value={form.frontendFamily}
													onChange={
														handleFrontendFamilyChange
													}
													options={
														WEBSITE_FAMILY_OPTIONS
													}
													searchable
													searchPlaceholder='Search website types'
												/>
												<p className='field-help'>
													Vite unlocks React, Vue, and
													Vanilla starters. Static
													gives you a plain HTML, CSS,
													and JavaScript project.
												</p>
											</div>

											<div className='field-group'>
												<span>Starter</span>
												{showFrontendPresetSelect ? (
													<SurfaceSelect
														value={
															form.frontendPreset
														}
														onChange={
															handleFrontendPresetChange
														}
														options={
															frontendPresetOptions
														}
														placeholder='Select a website starter'
														searchable
														searchPlaceholder='Search website starters'
													/>
												) : (
													<div className='composer-selection-preview'>
														<strong>
															{selectedFrontendPreset?.label ||
																getTemplateLabel(
																	form.frontend,
																)}
														</strong>
														<span>
															{form.frontendFamily ===
															'static'
																? 'Static sites already resolve to one compatible starter.'
																: 'Choose a website type to unlock matching starters.'}
														</span>
													</div>
												)}
											</div>

											<label className='field-group'>
												<span>Website port</span>
												<input
													type='number'
													value={form.frontendPort}
													disabled={!form.frontend}
													onChange={(event) =>
														updateForm(
															(previous) => ({
																...previous,
																frontendPort:
																	event.target
																		.value,
															}),
														)
													}
													placeholder={
														form.frontend
															? '3000'
															: 'Select a website starter first'
													}
												/>
											</label>

											<div className='field-group'>
												<span>Backend runtime</span>
												<SurfaceSelect
													value={form.backendRuntime}
													onChange={
														handleWebsiteBackendRuntimeChange
													}
													options={
														WEBSITE_BACKEND_RUNTIME_OPTIONS
													}
													searchable
													searchPlaceholder='Search website backends'
												/>
												<p className='field-help'>
													Add a backend to the website
													when you want API routes or
													server logic. Python HTTP
													and Java HTTP live here now.
												</p>
											</div>

											<div className='field-group'>
												<span>Backend starter</span>
												{form.backendRuntime ? (
													showBackendPresetSelect ? (
														<SurfaceSelect
															value={
																form.backendPreset
															}
															onChange={
																handleBackendPresetChange
															}
															options={
																backendPresetOptions
															}
															placeholder='Select a backend starter'
															searchable
															searchPlaceholder='Search backend starters'
														/>
													) : (
														<div className='composer-selection-preview'>
															<strong>
																{selectedBackendPreset?.label ||
																	getTemplateLabel(
																		form.backend,
																	)}
															</strong>
															<span>
																{form.backendRuntime ===
																'python'
																	? 'Python HTTP has one matching website backend starter.'
																	: form.backendRuntime ===
																		  'java'
																		? 'Java HTTP has one matching website backend starter.'
																		: 'This runtime already resolves to a compatible backend starter.'}
															</span>
														</div>
													)
												) : (
													<div className='composer-selection-preview'>
														<strong>
															No backend selected
														</strong>
														<span>
															Keep the website
															frontend-only or
															choose a backend
															runtime to attach an
															API service.
														</span>
													</div>
												)}
											</div>

											{backendPortRequired ? (
												<label className='field-group'>
													<span>Backend port</span>
													<input
														type='number'
														value={form.backendPort}
														disabled={!form.backend}
														onChange={(event) =>
															updateForm(
																(previous) => ({
																	...previous,
																	backendPort:
																		event
																			.target
																			.value,
																}),
															)
														}
														placeholder={
															form.backend
																? getSuggestedBackendPort(
																		form.backend,
																	)
																: 'Choose a backend starter first'
														}
													/>
												</label>
											) : (
												<div className='field-group'>
													<span>Backend port</span>
													<div className='composer-selection-preview'>
														<strong>
															{form.backend
																? 'No backend port'
																: 'Frontend-only website'}
														</strong>
														<span>
															{form.backend
																? 'This backend type does not need a persistent port.'
																: 'Add a backend runtime if you want a service port next to the website.'}
														</span>
													</div>
												</div>
											)}
										</>
									) : null}

									{composerLane === 'python' ||
									composerLane === 'java' ? (
										<>
											<div className='field-group'>
												<span>Project type</span>
												<SurfaceSelect
													value={form.backendPreset}
													onChange={
														handleBackendPresetChange
													}
													options={
														backendPresetOptions
													}
													placeholder='Select a project type'
													searchable={
														showBackendPresetSelect
													}
													searchPlaceholder={`Search ${composerLane} project types`}
												/>
												<p className='field-help'>
													{composerLane === 'python'
														? 'Python stays focused on CLI work here. Use Website if you want the Python HTTP server behind a frontend.'
														: 'Java stays focused on console and Maven work here. Use Website if you want the Java HTTP server behind a frontend.'}
												</p>
											</div>

											{backendPortRequired ? (
												<label className='field-group'>
													<span>
														{composerLane ===
														'python'
															? 'Service port'
															: 'Java service port'}
													</span>
													<input
														type='number'
														value={form.backendPort}
														disabled={!form.backend}
														onChange={(event) =>
															updateForm(
																(previous) => ({
																	...previous,
																	backendPort:
																		event
																			.target
																			.value,
																}),
															)
														}
														placeholder={
															form.backend
																? composerLane ===
																	'python'
																	? '8000'
																	: '8080'
																: 'Select a project type first'
														}
													/>
												</label>
											) : (
												<div className='field-group'>
													<span>Service port</span>
													<div className='composer-selection-preview'>
														<strong>
															{form.backend
																? 'No port required'
																: 'Choose a project type'}
														</strong>
														<span>
															{form.backend
																? 'This project launches from the editor terminal instead of a persistent web port.'
																: 'Service-style projects ask for a port. Terminal-first projects do not.'}
														</span>
													</div>
												</div>
											)}
										</>
									) : null}

									{!composerLane ? (
										<div className='field-group'>
											<span>Composer</span>
											<div className='composer-selection-preview'>
												<strong>
													Pick a fast lane first
												</strong>
												<span>
													Choose Website, Python, or
													Java above and the right
													fields will appear here
													automatically.
												</span>
											</div>
										</div>
									) : null}
								</div>
							</section>

							<section className='composer-stage-card composer-stage-card-summary'>
								<div className='composer-card-heading'>
									<span className='composer-step-badge'>
										Git
									</span>
									<div>
										<strong>Repository setup</strong>
										<p>
											New projects always create a root{' '}
											<code>README.md</code>, run{' '}
											<code>git init</code>, prepare the{' '}
											<code>origin</code> remote, make the
											first commit, and then push when
											your saved GitHub settings are
											ready.
										</p>
									</div>
								</div>

								<div className='composer-selection-summary'>
									<div className='composer-selection-chip'>
										<strong>Local repo</strong>
										<span>
											README + git init + first commit
										</span>
									</div>
									<div className='composer-selection-chip'>
										<strong>GitHub</strong>
										<span>
											{composerAutoCreateRepo
												? githubPublishTarget
												: 'Skip GitHub for this project'}
										</span>
									</div>
									<div className='composer-selection-chip'>
										<strong>Visibility</strong>
										<span>
											{composerAutoCreateRepo &&
											composerRepositoryVisibility ===
												'public'
												? 'Public'
												: composerAutoCreateRepo
													? 'Private'
													: 'Local only'}
										</span>
									</div>
								</div>
								<div className='field-group field-wide'>
									<span>Repository mode</span>
									<SurfaceSelect
										value={
											composerAutoCreateRepo
												? 'github'
												: 'local'
										}
										onChange={(nextValue) =>
											updateForm((previous) => ({
												...previous,
												autoCreateRepo:
													nextValue === 'github',
											}))
										}
										options={REPOSITORY_MODE_OPTIONS}
									/>
									<p className='field-help'>
										Starts from your Settings default, but
										you can keep this project local-only
										when you do not want a GitHub repo yet.
									</p>
								</div>
								{composerAutoCreateRepo ? (
									<div className='field-group field-wide'>
										<span>Repository visibility</span>
										<SurfaceSelect
											value={composerRepositoryVisibility}
											onChange={(nextValue) =>
												updateForm((previous) => ({
													...previous,
													visibility: nextValue,
												}))
											}
											options={
												REPOSITORY_VISIBILITY_OPTIONS
											}
										/>
										<p className='field-help'>
											Starts from your Settings default,
											but you can override it for this
											project before creation.
										</p>
									</div>
								) : (
									<div className='field-group field-wide'>
										<span>Repository visibility</span>
										<div className='composer-selection-preview'>
											<strong>
												Not needed for local-only mode
											</strong>
											<span>
												The dashboard will still create
												a local git repository with a
												first commit, but it will not
												create or connect a GitHub repo.
											</span>
										</div>
									</div>
								)}
								<p className='field-help'>
									{composerAutoCreateRepo &&
									githubPublishEnabledForProject
										? `The dashboard will create ${githubPublishTarget} as a ${composerRepositoryVisibility} repository and push the first commit automatically.`
										: composerAutoCreateRepo
											? 'GitHub publishing is enabled for this project in principle, but you still need to save a token in Settings before the dashboard can create repos for you.'
											: 'This project will stop after local git initialization and will not connect to GitHub during creation.'}
								</p>
								<div className='composer-settings-link-row'>
									<Link to='/settings' className='ghost-link'>
										<ArrowOutwardRounded fontSize='small' />
										Open GitHub settings
									</Link>
								</div>
							</section>
						</div>

						<section className='composer-stage-card composer-stage-card-advanced'>
							<div className='composer-card-heading'>
								<span className='composer-step-badge'>
									Step 4
								</span>
								<div>
									<strong>Advanced setup</strong>
									<p>
										Set the common project metadata once,
										then add Java-specific scaffold details
										whenever the selected project or backend
										uses Java.
									</p>
								</div>
							</div>

							<div className='composer-card-fields'>
								<label className='field-group'>
									<span>Description</span>
									<input
										value={form.description}
										onChange={(event) =>
											updateForm((previous) => ({
												...previous,
												description: event.target.value,
											}))
										}
										placeholder={
											form.name
												? `${form.name} workspace generated by the dashboard.`
												: 'Describe what this project is for'
										}
									/>
								</label>

								<label className='field-group'>
									<span>Initial version</span>
									<input
										value={form.version}
										onChange={(event) =>
											updateForm((previous) => ({
												...previous,
												version: event.target.value,
											}))
										}
										placeholder='0.1.0'
									/>
								</label>

								{selectedBackendRuntime === 'java' ? (
									<>
										<label className='field-group'>
											<span>Java package</span>
											<input
												value={form.javaPackageName}
												onChange={(event) =>
													updateForm((previous) => ({
														...previous,
														javaPackageName:
															event.target.value,
													}))
												}
												placeholder={`${composerJavaGroupId}.app`}
											/>
										</label>

										<label className='field-group'>
											<span>Main class</span>
											<input
												value={form.javaMainClass}
												onChange={(event) =>
													updateForm((previous) => ({
														...previous,
														javaMainClass:
															event.target.value,
													}))
												}
												placeholder='App'
											/>
										</label>

										<label className='field-group'>
											<span>Compiler release</span>
											<input
												value={form.javaVersion}
												onChange={(event) =>
													updateForm((previous) => ({
														...previous,
														javaVersion:
															event.target.value,
													}))
												}
												placeholder='11'
											/>
										</label>

										{form.backend === 'java-maven' ? (
											<>
												<label className='field-group'>
													<span>Group ID</span>
													<input
														value={form.javaGroupId}
														onChange={(event) =>
															updateForm(
																(previous) => ({
																	...previous,
																	javaGroupId:
																		event
																			.target
																			.value,
																}),
															)
														}
														placeholder='com.dashboard'
													/>
												</label>

												<label className='field-group'>
													<span>Artifact ID</span>
													<input
														value={
															form.javaArtifactId
														}
														onChange={(event) =>
															updateForm(
																(previous) => ({
																	...previous,
																	javaArtifactId:
																		event
																			.target
																			.value,
																}),
															)
														}
														placeholder={slugifyComposerToken(
															form.name ||
																'workspace-app',
														)}
													/>
												</label>

												<div className='field-group'>
													<span>Exec main class</span>
													<div className='composer-selection-preview'>
														<strong>
															{
																composerJavaExecClass
															}
														</strong>
														<span>
															This value is
															written to
															`exec.mainClass` in
															the generated
															`pom.xml`.
														</span>
													</div>
												</div>
											</>
										) : null}

										<div className='field-group'>
											<span>Java source path</span>
											<div className='composer-selection-preview'>
												<strong>
													{composerJavaSourcePath}
												</strong>
												<span>
													{form.backend ===
													'java-maven'
														? `The generated pom uses ${composerJavaArtifactId} with Java ${composerJavaVersion}.`
														: `The dashboard compiles ${composerJavaExecClass} with Java ${composerJavaVersion}.`}
												</span>
											</div>
										</div>
									</>
								) : (
									<div className='field-group'>
										<span>Project metadata</span>
										<div className='composer-selection-preview'>
											<strong>{composerVersion}</strong>
											<span>
												Version and description are
												applied to generated metadata
												files where the starter supports
												them.
											</span>
										</div>
									</div>
								)}
							</div>
						</section>

						<section className='composer-stage-card composer-stage-card-database'>
							<div className='composer-card-heading'>
								<span className='composer-step-badge'>
									Optional
								</span>
								<div>
									<strong>Attach a database</strong>
									<p>
										Link infrastructure now or keep the
										project app-only and add storage later.
									</p>
								</div>
							</div>

							<div className='field-group'>
								<div className='field-label-row'>
									<span>Linked database</span>
									<button
										type='button'
										className='inline-field-action'
										onClick={openDatabaseCreation}>
										<StorageRounded fontSize='inherit' />
										Create new database
									</button>
								</div>
								<SurfaceSelect
									value={form.databaseId}
									onChange={(nextValue) =>
										updateForm((previous) => ({
											...previous,
											databaseId: nextValue,
										}))
									}
									options={databaseOptions}
									searchable
									searchPlaceholder='Search databases'
								/>
								<p className='field-help'>
									Need a fresh local database? Create it in
									the databases workspace and come right back
									here with it selected.
								</p>
							</div>
						</section>
					</div>

					<div className='form-actions'>
						<button
							type='button'
							className='ghost-button'
							onClick={resetForm}>
							Reset
						</button>
						<button
							type='button'
							className='primary-action'
							onClick={createProject}
							disabled={isCreating}>
							<TerminalRounded fontSize='small' />
							{isCreating ? 'Creating...' : 'Create project'}
						</button>
					</div>
				</section>
			)}

			{!isComposerPage && (
				<section className='project-grid-board'>
					{visibleProjects.length > 0 ? (
						visibleProjects.map((project) => {
							const projectProgress = getProjectProgress(project);
							const primaryUrl = getPrimaryProjectUrl(project);
							const projectCrew = getProjectCrew(project);
							const scaffold = getProjectScaffold(project);
							const launchLabel =
								getProjectLaunchLabelForDisplay(project);
							const primaryEntry =
								getProjectPrimaryEntry(project);
							const commandLabel =
								getProjectCommandLabel(project);
							const projectDescription =
								getProjectDescription(project);
							const runtimeLabel =
								getProjectRuntimeLabel(project);
							const hasManagedServices =
								hasProjectOperationalMonitoring(project);
							const activeServiceCount =
								project.runtime?.activeServiceCount || 0;
							const expectedServiceCount =
								project.runtime?.expectedServiceCount || 0;

							return (
								<article
									key={project.name}
									className={`project-board-card status-${project.status}`}>
									<div className='project-card-top'>
										<div>
											<div className='card-badges'>
												<span
													className={`status-pill ${project.status}`}>
													{getStatusLabel(
														project.status,
													)}
												</span>
												{project.database && (
													<span className='meta-pill'>
														{project.database.type}
													</span>
												)}
											</div>
											<Link
												to={`/projects/${encodeURIComponent(project.name)}`}
												className='project-link'>
												<h3>{project.name}</h3>
											</Link>
											<p className='project-purpose-copy'>
												{projectDescription}
											</p>
											<p>{getProjectSummary(project)}</p>
										</div>

										<div className='project-port-cluster'>
											{project.frontendPort && (
												<span className='port-pill frontend'>
													<PublicRounded fontSize='inherit' />
													<span>Web</span>
													<strong>
														:{project.frontendPort}
													</strong>
												</span>
											)}
											{project.backendPort && (
												<span className='port-pill backend'>
													<HubRounded fontSize='inherit' />
													<span>
														{getBackendPortLabel(
															project.backend,
														)}
													</span>
													<strong>
														:{project.backendPort}
													</strong>
												</span>
											)}
										</div>
									</div>

									<div className='progress-block'>
										<div className='progress-meta'>
											<span>Workspace progress</span>
											<strong>{projectProgress}%</strong>
										</div>
										<div className='progress-track'>
											<span
												style={{
													width: `${projectProgress}%`,
												}}
											/>
										</div>
									</div>

									<div className='project-task-row'>
										<div className='task-stat'>
											<span>Total tasks</span>
											<strong>
												{project.taskSummary?.total ||
													0}
											</strong>
										</div>
										<div className='task-stat'>
											<span>Completed</span>
											<strong>
												{project.taskSummary
													?.completed || 0}
											</strong>
										</div>
										<div className='task-stat'>
											<span>Open</span>
											<strong>
												{project.taskSummary?.pending ||
													0}
											</strong>
										</div>
									</div>

									<div className='project-monitoring-grid'>
										<div className='monitoring-stat'>
											<span>
												<CodeRounded fontSize='inherit' />
												Launch mode
											</span>
											<strong>{launchLabel}</strong>
										</div>
										<div className='monitoring-stat'>
											<span>
												<TerminalRounded fontSize='inherit' />
												Primary entry
											</span>
											<strong>{primaryEntry}</strong>
										</div>
										{project.backend === 'java-maven' ? (
											<>
												<div className='monitoring-stat'>
													<span>
														<RocketLaunchRounded fontSize='inherit' />
														Group ID
													</span>
													<strong>
														{scaffold.javaGroupId}
													</strong>
												</div>
												<div className='monitoring-stat'>
													<span>
														<ConstructionRounded fontSize='inherit' />
														Artifact
													</span>
													<strong>
														{scaffold.javaArtifactId}
													</strong>
												</div>
											</>
										) : (
											<>
												<div className='monitoring-stat'>
													<span>
														<TaskAltRounded fontSize='inherit' />
														Runtime
													</span>
													<strong>{runtimeLabel}</strong>
												</div>
												<div className='monitoring-stat'>
													<span>
														<FolderRounded fontSize='inherit' />
														Command
													</span>
													<strong>{commandLabel}</strong>
												</div>
											</>
										)}
									</div>

									<div className='project-health-row'>
										<span className='health-pill offline'>
											{hasManagedServices ? (
												<>
													<RocketLaunchRounded fontSize='inherit' />
													Managed runtime
												</>
											) : (
												<>
													<TerminalRounded fontSize='inherit' />
													Terminal workflow
												</>
											)}
										</span>
										{hasManagedServices &&
											expectedServiceCount > 0 && (
											<span className='monitoring-hint'>
												Services {activeServiceCount}/
												{expectedServiceCount}
											</span>
										)}
										<span className='monitoring-hint'>
											{runtimeLabel}
										</span>
										<span className='monitoring-hint'>
											Version {scaffold.version}
										</span>
									</div>

									<div className='project-card-middle'>
										<div className='avatar-group'>
											{projectCrew.map((entry) => (
												<div
													key={entry.label}
													className={`avatar-chip ${entry.accent}`}>
													{entry.label}
												</div>
											))}
										</div>

										<div className='service-tags'>
											{project.frontend && (
												<span>
													<PublicRounded fontSize='inherit' />
													Frontend
												</span>
											)}
											{project.backend && (
												<span>
													<HubRounded fontSize='inherit' />
													{getBackendChipLabel(
														project.backend,
													)}
												</span>
											)}
											{project.database && (
												<span>
													<DnsRounded fontSize='inherit' />
													Database
												</span>
											)}
										</div>
									</div>

									<div className='project-card-actions'>
										<div className='project-card-link-row'>
											<Link
												to={`/projects/${encodeURIComponent(project.name)}`}
												className='ghost-link project-inline-action'>
												<ArrowOutwardRounded fontSize='small' />
												Open
											</Link>

											<Link
												to={`/projects/${encodeURIComponent(project.name)}/editor`}
												className='ghost-link project-inline-action'>
												<CodeRounded fontSize='small' />
												Editor
											</Link>

											<Link
												to={`/tasks?project=${encodeURIComponent(project.name)}`}
												className='ghost-link project-inline-action'>
												<TaskAltRounded fontSize='small' />
												Tasks
											</Link>

											{primaryUrl && (
												<a
													href={primaryUrl}
													target='_blank'
													rel='noopener noreferrer'
													className='secondary-link project-inline-action'>
													<LanRounded fontSize='small' />
													Preview
												</a>
											)}

											{project.repository?.url && (
												<a
													href={
														project.repository.url
													}
													target='_blank'
													rel='noopener noreferrer'
													className='ghost-link project-inline-action'>
													<ArrowOutwardRounded fontSize='small' />
													GitHub
												</a>
											)}
										</div>

										<div className='project-card-runtime-row'>
											{project.hasManagedServices ? (
												project.status === 'stopped' ? (
													<button
														type='button'
														className='success-button project-inline-action'
														disabled={
															pendingAction ===
															`start:${project.name}`
														}
														onClick={() =>
															startProject(
																project.name,
															)
														}>
														<PlayArrowRounded fontSize='small' />
														{pendingAction ===
														`start:${project.name}`
															? 'Starting...'
															: 'Start'}
													</button>
												) : (
													<button
														type='button'
														className='danger-button project-inline-action'
														disabled={
															pendingAction ===
															`stop:${project.name}`
														}
														onClick={() =>
															stopProject(
																project.name,
															)
														}>
														<StopRounded fontSize='small' />
														{pendingAction ===
														`stop:${project.name}`
															? 'Stopping...'
															: 'Stop'}
													</button>
												)
											) : (
												<Link
													to={`/projects/${encodeURIComponent(project.name)}/editor`}
													className='success-button project-inline-action'>
													<TerminalRounded fontSize='small' />
													Run in editor
												</Link>
											)}

											<button
												type='button'
												className='text-button project-delete-button'
												disabled={
													pendingAction ===
													`delete:${project.name}`
												}
												onClick={() =>
													deleteProject(project)
												}>
												<DeleteOutlineRounded fontSize='small' />
												Delete
											</button>
										</div>
									</div>
								</article>
							);
						})
					) : (
						<div className='empty-board-state'>
							<div className='empty-board-icon'>
								<FolderRounded />
							</div>
							<h3>No projects match this view yet.</h3>
							<p>
								Adjust the search or filters, or create a new
								workspace to start populating the board.
							</p>
						</div>
					)}
				</section>
			)}
		</div>
	);
}

export default Overview;
