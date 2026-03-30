import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import CodeRounded from '@mui/icons-material/CodeRounded';
import DataObjectRounded from '@mui/icons-material/DataObjectRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import InsertDriveFileRounded from '@mui/icons-material/InsertDriveFileRounded';
import KeyboardArrowRightRounded from '@mui/icons-material/KeyboardArrowRightRounded';
import NoteAddRounded from '@mui/icons-material/NoteAddRounded';
import CreateNewFolderRounded from '@mui/icons-material/CreateNewFolderRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import StopRounded from '@mui/icons-material/StopRounded';
import TerminalRounded from '@mui/icons-material/TerminalRounded';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import { API_BASE_URL } from '../config/api';
import { getSearchParamValue } from '../utils/searchParams';
import './ProjectWorkspace.css';

const API = API_BASE_URL;

/**
 * Formats file and execution timestamps shown in the workspace UI.
 *
 * @param {string | null | undefined} value - ISO timestamp value.
 * @returns {string} Locale-formatted date/time label.
 */
function formatTimestamp(value) {
	if (!value) {
		return 'Not saved yet';
	}

	return new Date(value).toLocaleString();
}

/**
 * Formats file sizes for the workspace tree and editor metadata.
 *
 * @param {number | null | undefined} value - Raw byte value.
 * @returns {string} Human-readable size label.
 */
function formatSize(value) {
	if (!Number.isFinite(value) || value <= 0) {
		return '0 B';
	}

	const units = ['B', 'KB', 'MB'];
	let size = value;
	let unitIndex = 0;

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex += 1;
	}

	return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Converts a terminal execution status into display text.
 *
 * @param {string} status - Execution status returned by the API.
 * @returns {string} User-facing status label.
 */
function formatExecutionStatus(status) {
	switch (status) {
		case 'running':
			return 'Running';
		case 'completed':
			return 'Completed';
		case 'failed':
			return 'Failed';
		case 'stopped':
			return 'Stopped';
		default:
			return 'Idle';
	}
}

/**
 * Finds one file-tree entry by its project-relative path.
 *
 * @param {Array<object>} entries - Workspace tree entries.
 * @param {string} targetPath - Project-relative path to find.
 * @returns {object | null} Matching tree entry when found.
 */
function findTreeEntry(entries, targetPath) {
	for (const entry of entries) {
		if (entry.path === targetPath) {
			return entry;
		}

		if (entry.type === 'directory' && entry.children?.length) {
			const nestedMatch = findTreeEntry(entry.children, targetPath);
			if (nestedMatch) {
				return nestedMatch;
			}
		}
	}

	return null;
}

/**
 * Builds the initial set of expanded folders for the workspace tree.
 *
 * @param {Array<object>} entries - Workspace tree entries.
 * @returns {string[]} Folder paths that should start expanded.
 */
function collectDefaultExpandedPaths(entries) {
	return entries
		.filter((entry) => entry.type === 'directory')
		.map((entry) => entry.path);
}

function collectNestedDirectoryPaths(entries) {
	return entries.flatMap((entry) => {
		if (entry.type !== 'directory') {
			return [];
		}

		return [
			entry.path,
			...(entry.children?.length
				? collectNestedDirectoryPaths(entry.children)
				: []),
		];
	});
}

function countTreeEntries(entries) {
	return entries.reduce((total, entry) => {
		if (entry.type === 'directory' && entry.children?.length) {
			return total + 1 + countTreeEntries(entry.children);
		}

		return total + 1;
	}, 0);
}

/**
 * Filters the workspace tree while keeping matching directory ancestry intact.
 *
 * @param {Array<object>} entries - Workspace tree entries.
 * @param {string} normalizedQuery - Lower-case search query.
 * @returns {Array<object>} Filtered workspace tree.
 */
function filterTreeEntries(entries, normalizedQuery) {
	if (!normalizedQuery) {
		return entries;
	}

	return entries.reduce((visibleEntries, entry) => {
		const matchesEntry = [entry.name, entry.path]
			.filter(Boolean)
			.join(' ')
			.toLowerCase()
			.includes(normalizedQuery);
		const filteredChildren =
			entry.type === 'directory' && entry.children?.length
				? matchesEntry
					? entry.children
					: filterTreeEntries(entry.children, normalizedQuery)
				: [];

		if (
			matchesEntry ||
			(entry.type === 'directory' && filteredChildren.length > 0)
		) {
			visibleEntries.push(
				entry.type === 'directory'
					? { ...entry, children: filteredChildren }
					: entry,
			);
		}

		return visibleEntries;
	}, []);
}

function getParentPath(entryPath) {
	if (!entryPath || !entryPath.includes('/')) {
		return '';
	}

	return entryPath.split('/').slice(0, -1).join('/');
}

/**
 * Suggests a default create path based on the currently selected tree entry.
 *
 * @param {object | null} selectedEntry - Currently selected tree entry.
 * @param {'file' | 'directory'} entryType - Entry type the user wants to create.
 * @returns {string} Suggested project-relative path.
 */
function getSuggestedPath(selectedEntry, entryType) {
	const baseDirectory = selectedEntry
		? selectedEntry.type === 'directory'
			? selectedEntry.path
			: getParentPath(selectedEntry.path)
		: '';
	const defaultName =
		entryType === 'directory' ? 'new-folder' : 'new-file.txt';

	return baseDirectory ? `${baseDirectory}/${defaultName}` : defaultName;
}

/**
 * Chooses the default working directory for the terminal composer.
 *
 * @param {object | null} projectMeta - Project metadata loaded from the API.
 * @param {object | null} primaryCommandPreset - Primary preset returned by the API.
 * @returns {string} Suggested project-relative working directory.
 */
function getDefaultTerminalWorkingDirectory(projectMeta, primaryCommandPreset) {
	if (primaryCommandPreset?.cwd) {
		return primaryCommandPreset.cwd;
	}

	if (
		projectMeta?.backend === 'java-console' ||
		projectMeta?.backend === 'java-maven'
	) {
		return '';
	}

	if (projectMeta?.backend) {
		return 'backend';
	}

	if (projectMeta?.frontend) {
		return 'frontend';
	}

	return '';
}

/**
 * Chooses the icon used for a file-tree entry.
 *
 * @param {object} entry - Workspace tree entry.
 * @returns {JSX.Element} Icon component instance.
 */
function getEntryIcon(entry) {
	if (entry.type === 'directory') {
		return FolderRounded;
	}

	const extension =
		entry.extension || entry.name.split('.').pop()?.toLowerCase();
	if (
		[
			'js',
			'jsx',
			'ts',
			'tsx',
			'mjs',
			'cjs',
			'css',
			'scss',
			'html',
		].includes(extension)
	) {
		return CodeRounded;
	}

	if (['json', 'yml', 'yaml', 'env', 'toml'].includes(extension)) {
		return DataObjectRounded;
	}

	if (['md', 'txt'].includes(extension)) {
		return DescriptionRounded;
	}

	return InsertDriveFileRounded;
}

/**
 * Renders the inline project editor and terminal workspace.
 *
 * @param {{projectName: string, standalone?: boolean}} props - Component props.
 * @param {string} props.projectName - Project name whose workspace should be loaded.
 * @param {boolean} [props.standalone=false] - Whether the workspace is rendered as a full page.
 * @returns {JSX.Element} Project workspace surface.
 */
function ProjectWorkspace({ projectName, standalone = false }) {
	const [searchParams] = useSearchParams();
	const [workspace, setWorkspace] = useState({
		entries: [],
		entryCount: 0,
		truncated: false,
		rootPath: '',
	});
	const [treeLoading, setTreeLoading] = useState(true);
	const [treeError, setTreeError] = useState('');
	const [projectMeta, setProjectMeta] = useState(null);
	const [expandedPaths, setExpandedPaths] = useState([]);
	const [selectedEntry, setSelectedEntry] = useState(null);
	const [selectedFile, setSelectedFile] = useState(null);
	const [editorValue, setEditorValue] = useState('');
	const [editorDirty, setEditorDirty] = useState(false);
	const [fileLoading, setFileLoading] = useState(false);
	const [fileError, setFileError] = useState('');
	const [saveBusy, setSaveBusy] = useState(false);
	const [actionBusy, setActionBusy] = useState('');
	const [creationDraft, setCreationDraft] = useState({
		open: false,
		type: 'file',
		path: '',
	});
	const [commandValue, setCommandValue] = useState('');
	const [terminalExecution, setTerminalExecution] = useState(null);
	const [terminalBusy, setTerminalBusy] = useState(false);
	const [terminalError, setTerminalError] = useState('');
	const textareaRef = useRef(null);
	const lineNumbersRef = useRef(null);
	const scrollSyncRef = useRef(false);
	const terminalOutputRef = useRef(null);
	const treeSearchQuery = getSearchParamValue(searchParams, 'q')
		.trim()
		.toLowerCase();
	const hasTreeSearch = Boolean(treeSearchQuery);
	const visibleEntries = useMemo(
		() => filterTreeEntries(workspace.entries, treeSearchQuery),
		[treeSearchQuery, workspace.entries],
	);
	const visibleEntryCount = useMemo(
		() => countTreeEntries(visibleEntries),
		[visibleEntries],
	);
	const effectiveExpandedPaths = hasTreeSearch
		? collectNestedDirectoryPaths(visibleEntries)
		: expandedPaths;

	const syncScrollPositions = ({ top, left = 0 } = {}) => {
		scrollSyncRef.current = true;

		window.requestAnimationFrame(() => {
			if (lineNumbersRef.current && Number.isFinite(top)) {
				lineNumbersRef.current.scrollTop = top;
			}

			if (textareaRef.current) {
				if (
					Number.isFinite(top) &&
					textareaRef.current.scrollTop !== top
				) {
					textareaRef.current.scrollTop = top;
				}

				if (
					Number.isFinite(left) &&
					textareaRef.current.scrollLeft !== left
				) {
					textareaRef.current.scrollLeft = left;
				}
			}

			scrollSyncRef.current = false;
		});
	};

	const syncSelectionAfterTreeRefresh = (entries, currentPath) => {
		if (!currentPath) {
			return null;
		}

		return findTreeEntry(entries, currentPath);
	};

	const loadWorkspace = async ({
		preserveSelection = true,
		preferredPath = null,
	} = {}) => {
		setTreeLoading(true);

		try {
			const response = await axios.get(
				`${API}/projects/${encodeURIComponent(projectName)}/files`,
			);
			const nextWorkspace = response.data;
			setWorkspace(nextWorkspace);
			setTreeError('');

			setExpandedPaths((previous) => {
				if (previous.length > 0) {
					return previous;
				}

				return collectDefaultExpandedPaths(nextWorkspace.entries);
			});

			if (preserveSelection) {
				const nextSelection = syncSelectionAfterTreeRefresh(
					nextWorkspace.entries,
					preferredPath || selectedEntry?.path || selectedFile?.path,
				);
				setSelectedEntry(nextSelection);

				if (!nextSelection) {
					setSelectedFile(null);
				}
			}
		} catch (error) {
			setTreeError(
				error.response?.data?.error ||
					'Unable to load the project workspace.',
			);
		} finally {
			setTreeLoading(false);
		}
	};

	const loadProjectMeta = async () => {
		try {
			const response = await axios.get(
				`${API}/projects/${encodeURIComponent(projectName)}`,
			);
			setProjectMeta(response.data);
			setTerminalError('');
		} catch (error) {
			setTerminalError(
				error.response?.data?.error ||
					'Unable to load project commands for the editor.',
			);
		}
	};

	useEffect(() => {
		setWorkspace({
			entries: [],
			entryCount: 0,
			truncated: false,
			rootPath: '',
		});
		setExpandedPaths([]);
		setSelectedEntry(null);
		setSelectedFile(null);
		setEditorValue('');
		setEditorDirty(false);
		setFileError('');
		setCreationDraft({ open: false, type: 'file', path: '' });
		setProjectMeta(null);
		setCommandValue('');
		setTerminalExecution(null);
		setTerminalBusy(false);
		setTerminalError('');
		loadWorkspace({ preserveSelection: false });
		loadProjectMeta();
	}, [projectName]);

	useEffect(() => {
		if (!terminalExecution?.id || terminalExecution.status !== 'running') {
			return undefined;
		}

		const intervalId = window.setInterval(async () => {
			try {
				const response = await axios.get(
					`${API}/projects/${encodeURIComponent(
						projectName,
					)}/terminal/${terminalExecution.id}`,
				);
				setTerminalExecution(response.data);
			} catch (error) {
				setTerminalError(
					error.response?.data?.error ||
						'Unable to refresh terminal output.',
				);
			}
		}, 1200);

		return () => window.clearInterval(intervalId);
	}, [projectName, terminalExecution?.id, terminalExecution?.status]);

	useEffect(() => {
		terminalOutputRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [terminalExecution?.output, terminalExecution?.status]);

	const openFile = async (entry) => {
		if (
			editorDirty &&
			selectedFile?.path &&
			selectedFile.path !== entry.path &&
			!window.confirm(
				'You have unsaved changes. Discard them and open another file?',
			)
		) {
			return;
		}

		setSelectedEntry(entry);
		setSelectedFile(null);
		setFileError('');
		setFileLoading(true);

		try {
			const response = await axios.get(
				`${API}/projects/${encodeURIComponent(projectName)}/files/content`,
				{
					params: { path: entry.path },
				},
			);
			setSelectedFile(response.data);
			setEditorValue(response.data.content);
			setEditorDirty(false);
			window.requestAnimationFrame(() => {
				syncScrollPositions({ top: 0, left: 0 });
			});
		} catch (error) {
			setFileError(
				error.response?.data?.error ||
					'Unable to open this file in the editor.',
			);
		} finally {
			setFileLoading(false);
		}
	};

	const toggleDirectory = (entry) => {
		if (
			editorDirty &&
			selectedFile?.path &&
			selectedFile.path !== entry.path &&
			!window.confirm(
				'You have unsaved changes. Discard them and switch to this folder?',
			)
		) {
			return;
		}

		setSelectedEntry(entry);
		setSelectedFile(null);
		setEditorValue('');
		setEditorDirty(false);
		setFileError('');
		setExpandedPaths((previous) =>
			previous.includes(entry.path)
				? previous.filter((value) => value !== entry.path)
				: [...previous, entry.path],
		);
	};

	const handleEntryClick = (entry) => {
		if (entry.type === 'directory') {
			toggleDirectory(entry);
			return;
		}

		openFile(entry);
	};

	const saveFile = async () => {
		if (!selectedFile?.path) {
			return false;
		}

		const currentPath = selectedFile.path;
		setSaveBusy(true);
		try {
			const response = await axios.put(
				`${API}/projects/${encodeURIComponent(projectName)}/files/content`,
				{
					path: currentPath,
					content: editorValue,
				},
			);
			setSelectedFile((previous) => ({
				...(previous || {}),
				...response.data,
				content: editorValue,
			}));
			setEditorDirty(false);
			setFileError('');
			await loadWorkspace({
				preferredPath: currentPath,
			});
			return true;
		} catch (error) {
			setFileError(
				error.response?.data?.error || 'Unable to save this file.',
			);
			return false;
		} finally {
			setSaveBusy(false);
		}
	};

	const openCreateDraft = (type) => {
		setCreationDraft({
			open: true,
			type,
			path: getSuggestedPath(selectedEntry, type),
		});
	};

	const submitCreation = async () => {
		if (!creationDraft.path.trim()) {
			return;
		}

		setActionBusy(`create:${creationDraft.type}`);
		try {
			const response = await axios.post(
				`${API}/projects/${encodeURIComponent(projectName)}/files`,
				{
					path: creationDraft.path.trim(),
					type: creationDraft.type,
				},
			);
			const createdEntry = response.data;
			setCreationDraft((previous) => ({ ...previous, open: false }));

			const pathSegments = createdEntry.path.split('/');
			const directorySegments =
				createdEntry.type === 'directory'
					? pathSegments
					: pathSegments.slice(0, -1);
			const pathsToExpand = [];
			for (let index = 0; index < directorySegments.length; index += 1) {
				pathsToExpand.push(
					directorySegments.slice(0, index + 1).join('/'),
				);
			}
			setExpandedPaths((previous) => [
				...new Set([...previous, ...pathsToExpand]),
			]);

			await loadWorkspace({
				preferredPath: createdEntry.path,
			});

			if (createdEntry.type === 'file') {
				await openFile(createdEntry);
			}
		} catch (error) {
			setFileError(
				error.response?.data?.error ||
					'Unable to create that file or folder.',
			);
		} finally {
			setActionBusy('');
		}
	};

	const deleteEntry = async () => {
		if (!selectedEntry?.path) {
			return;
		}

		const entryLabel =
			selectedEntry.type === 'directory' ? 'folder' : 'file';
		if (
			!window.confirm(
				`Delete this ${entryLabel} from the project?\n\n${selectedEntry.path}`,
			)
		) {
			return;
		}

		setActionBusy(`delete:${selectedEntry.path}`);
		try {
			await axios.delete(
				`${API}/projects/${encodeURIComponent(projectName)}/files`,
				{
					params: { path: selectedEntry.path },
				},
			);
			setSelectedEntry(null);
			setSelectedFile(null);
			setEditorValue('');
			setEditorDirty(false);
			setFileError('');
			await loadWorkspace({ preserveSelection: false });
		} catch (error) {
			setFileError(
				error.response?.data?.error ||
					'Unable to delete that project item.',
			);
		} finally {
			setActionBusy('');
		}
	};

	const handleEditorScroll = () => {
		if (!textareaRef.current || scrollSyncRef.current) {
			return;
		}

		syncScrollPositions({
			top: textareaRef.current.scrollTop,
			left: textareaRef.current.scrollLeft,
		});
	};

	const handleLineNumberScroll = () => {
		if (
			!lineNumbersRef.current ||
			!textareaRef.current ||
			scrollSyncRef.current
		) {
			return;
		}

		syncScrollPositions({
			top: lineNumbersRef.current.scrollTop,
			left: textareaRef.current.scrollLeft,
		});
	};

	const handleLineNumberMouseDown = (event) => {
		event.preventDefault();
		textareaRef.current?.focus();
	};

	const renderTree = (entries, depth = 0) =>
		entries.map((entry) => {
			const EntryIcon = getEntryIcon(entry);
			const isDirectory = entry.type === 'directory';
			const isExpanded = effectiveExpandedPaths.includes(entry.path);
			const isSelected =
				selectedEntry?.path === entry.path ||
				selectedFile?.path === entry.path;

			return (
				<div key={entry.path} className='workspace-tree-node'>
					<button
						type='button'
						className={`workspace-tree-entry ${
							isSelected ? 'active' : ''
						} ${isDirectory ? 'directory' : 'file'}`}
						style={{ paddingLeft: `${12 + depth * 16}px` }}
						onClick={() => handleEntryClick(entry)}>
						{isDirectory ? (
							<span
								className={`workspace-tree-caret ${
									isExpanded ? 'expanded' : ''
								}`}>
								<KeyboardArrowRightRounded fontSize='inherit' />
							</span>
						) : (
							<span className='workspace-tree-caret placeholder' />
						)}
						<span className='workspace-tree-icon'>
							{isDirectory ? (
								isExpanded ? (
									<FolderOpenRounded fontSize='inherit' />
								) : (
									<FolderRounded fontSize='inherit' />
								)
							) : (
								<EntryIcon fontSize='inherit' />
							)}
						</span>
						<span className='workspace-tree-label'>
							{entry.name}
						</span>
					</button>

					{isDirectory &&
						isExpanded &&
						entry.children?.length > 0 && (
							<div className='workspace-tree-children'>
								{renderTree(entry.children, depth + 1)}
							</div>
						)}
				</div>
			);
		});

	const selectedDirectory =
		selectedEntry?.type === 'directory'
			? selectedEntry
			: selectedEntry?.type === 'file'
				? findTreeEntry(
						workspace.entries,
						getParentPath(selectedEntry.path),
					)
				: null;
	const lineCount = Math.max(1, editorValue.split('\n').length);
	const lineNumbers = Array.from(
		{ length: lineCount },
		(_, index) => index + 1,
	);

	useEffect(() => {
		if (!selectedFile) {
			return;
		}

		window.requestAnimationFrame(() => {
			if (!textareaRef.current) {
				return;
			}

			syncScrollPositions({
				top: textareaRef.current.scrollTop,
				left: textareaRef.current.scrollLeft,
			});
		});
	}, [lineCount, selectedFile?.path]);

	const commandPresets = projectMeta?.commandPresets || [];
	const primaryCommandPreset =
		commandPresets.find((preset) => preset.primary) ||
		commandPresets[0] ||
		null;
	const executionRunning = terminalExecution?.status === 'running';
	const selectedWorkingDirectory =
		selectedEntry?.type === 'directory'
			? selectedEntry.path
			: selectedFile?.path
				? getParentPath(selectedFile.path)
				: '';
	const terminalWorkingDirectory =
		selectedWorkingDirectory ||
		getDefaultTerminalWorkingDirectory(projectMeta, primaryCommandPreset);

	const launchTerminalExecution = async (request) => {
		setTerminalBusy(true);
		setTerminalError('');

		try {
			const response = await request();
			setTerminalExecution(response.data);
			await loadProjectMeta();
		} catch (error) {
			setTerminalError(
				error.response?.data?.error ||
					'Unable to start that terminal command.',
			);
		} finally {
			setTerminalBusy(false);
		}
	};

	const runPreset = async (preset) => {
		if (!preset) {
			return;
		}

		if (selectedFile?.path && editorDirty) {
			const saved = await saveFile();
			if (!saved) {
				return;
			}
		}

		await launchTerminalExecution(() =>
			axios.post(
				`${API}/projects/${encodeURIComponent(
					projectName,
				)}/terminal/presets/${encodeURIComponent(preset.id)}`,
			),
		);
	};

	const runManualCommand = async () => {
		if (!commandValue.trim()) {
			return;
		}

		await launchTerminalExecution(() =>
			axios.post(
				`${API}/projects/${encodeURIComponent(projectName)}/terminal/execute`,
				{
					command: commandValue.trim(),
					cwd: terminalWorkingDirectory,
					label: 'Manual command',
				},
			),
		);
		setCommandValue('');
	};

	const stopExecution = async () => {
		if (!terminalExecution?.id || terminalExecution.status !== 'running') {
			return;
		}

		setTerminalBusy(true);
		try {
			const response = await axios.post(
				`${API}/projects/${encodeURIComponent(
					projectName,
				)}/terminal/${terminalExecution.id}/stop`,
			);
			setTerminalExecution(response.data);
		} catch (error) {
			setTerminalError(
				error.response?.data?.error ||
					'Unable to stop the running command.',
			);
		} finally {
			setTerminalBusy(false);
		}
	};

	const copyTerminalOutput = async () => {
		if (!terminalExecution?.output) {
			return;
		}

		try {
			await navigator.clipboard.writeText(terminalExecution.output);
		} catch (error) {
			setTerminalError('Unable to copy terminal output.');
		}
	};

	const openInVsCode = () => {
		if (!projectMeta?.projectPath) {
			return;
		}

		window.open(`vscode://file/${projectMeta.projectPath}`);
	};

	return (
		<div
			className={`workspace-shell-stack ${standalone ? 'standalone' : ''}`}>
			<article
				className={`detail-card detail-card-wide workspace-editor-card ${
					standalone ? 'standalone' : ''
				}`}>
				<div className='card-heading card-heading-spread'>
					<div>
						<span className='card-label'>Workspace</span>
						<h3>Project files</h3>
					</div>
					<div className='workspace-heading-actions'>
						<button
							type='button'
							className='ghost-button'
							onClick={() => loadWorkspace()}>
							<RefreshRounded fontSize='small' />
							Refresh tree
						</button>
						<button
							type='button'
							className='ghost-button'
							onClick={() => openCreateDraft('file')}>
							<NoteAddRounded fontSize='small' />
							New file
						</button>
						<button
							type='button'
							className='ghost-button'
							onClick={() => openCreateDraft('directory')}>
							<CreateNewFolderRounded fontSize='small' />
							New folder
						</button>
						<button
							type='button'
							className='ghost-button'
							disabled={
								!selectedEntry ||
								actionBusy.startsWith('delete:')
							}
							onClick={deleteEntry}>
							<DeleteOutlineRounded fontSize='small' />
							Delete
						</button>
						{projectMeta?.projectPath && (
							<button
								type='button'
								className='ghost-button'
								onClick={openInVsCode}>
								<ArrowOutwardRounded fontSize='small' />
								Open IDE
							</button>
						)}
						{primaryCommandPreset && (
							<button
								type='button'
								className='success-button'
								disabled={terminalBusy || executionRunning}
								onClick={() => runPreset(primaryCommandPreset)}>
								<PlayArrowRounded fontSize='small' />
								{selectedFile?.path && editorDirty
									? 'Save + Run'
									: primaryCommandPreset.label}
							</button>
						)}
						{terminalExecution?.status === 'running' && (
							<button
								type='button'
								className='danger-button'
								disabled={terminalBusy}
								onClick={stopExecution}>
								<StopRounded fontSize='small' />
								Stop run
							</button>
						)}
						<button
							type='button'
							className='success-button'
							disabled={!selectedFile || !editorDirty || saveBusy}
							onClick={saveFile}>
							<SaveRounded fontSize='small' />
							{saveBusy ? 'Saving...' : 'Save file'}
						</button>
					</div>
				</div>

				<div className='workspace-meta-bar'>
					<span>
						{workspace.rootPath || 'Loading workspace path...'}
					</span>
					<strong>
						{hasTreeSearch
							? `${visibleEntryCount} matching items`
							: `${workspace.entryCount} visible items${
									workspace.truncated ? ' (trimmed)' : ''
								}`}
					</strong>
				</div>

				{creationDraft.open && (
					<div className='workspace-create-bar'>
						<div className='workspace-create-copy'>
							<strong>
								{creationDraft.type === 'directory'
									? 'Create folder'
									: 'Create file'}
							</strong>
							<span>
								Use a path inside this project. Example:{' '}
								{selectedDirectory?.path
									? `${selectedDirectory.path}/example`
									: 'src/example'}
							</span>
						</div>
						<input
							value={creationDraft.path}
							onChange={(event) =>
								setCreationDraft((previous) => ({
									...previous,
									path: event.target.value,
								}))
							}
							placeholder='src/components/NewFile.jsx'
						/>
						<div className='workspace-create-actions'>
							<button
								type='button'
								className='ghost-button'
								onClick={() =>
									setCreationDraft((previous) => ({
										...previous,
										open: false,
									}))
								}>
								Cancel
							</button>
							<button
								type='button'
								className='primary-action'
								disabled={actionBusy.startsWith('create:')}
								onClick={submitCreation}>
								{actionBusy.startsWith('create:')
									? 'Creating...'
									: creationDraft.type === 'directory'
										? 'Create folder'
										: 'Create file'}
							</button>
						</div>
					</div>
				)}

				{fileError && (
					<div className='workspace-error-banner'>{fileError}</div>
				)}
				{treeError && (
					<div className='workspace-error-banner'>{treeError}</div>
				)}

				<div className='workspace-editor-grid'>
					<div className='workspace-tree-shell'>
						<div className='workspace-panel-head'>
							<strong>Explorer</strong>
							<span>
								{treeLoading ? 'Refreshing...' : 'Live tree'}
							</span>
						</div>
						<div className='workspace-tree-scroll'>
							{treeLoading ? (
								<div className='workspace-empty-state'>
									Loading project files...
								</div>
							) : visibleEntries.length > 0 ? (
								renderTree(visibleEntries)
							) : (
								<div className='workspace-empty-state'>
									{hasTreeSearch
										? 'No files or folders match the current search.'
										: 'This project does not have any editable files yet.'}
								</div>
							)}
						</div>
					</div>

					<div className='workspace-editor-shell'>
						<div className='workspace-panel-head'>
							<div className='workspace-editor-headline'>
								<strong>
									{selectedFile?.path ||
										selectedEntry?.path ||
										'Choose a file'}
								</strong>
								<span>
									{selectedFile
										? `${formatSize(selectedFile.size)} | updated ${formatTimestamp(
												selectedFile.modifiedAt,
											)}`
										: selectedEntry?.type === 'directory'
											? 'Folder selected'
											: 'Nothing open'}
								</span>
							</div>
							{selectedFile && editorDirty && (
								<span className='workspace-dirty-pill'>
									Unsaved
								</span>
							)}
						</div>

						{fileLoading ? (
							<div className='workspace-empty-state'>
								Opening file...
							</div>
						) : selectedFile ? (
							<div className='workspace-code-shell'>
								<div
									ref={lineNumbersRef}
									className='workspace-line-numbers'
									onScroll={handleLineNumberScroll}
									onMouseDown={handleLineNumberMouseDown}
									aria-hidden='true'>
									{lineNumbers.map((lineNumber) => (
										<span
											key={lineNumber}
											className='workspace-line-number'>
											{lineNumber}
										</span>
									))}
								</div>
								<textarea
									ref={textareaRef}
									className='workspace-editor-textarea'
									spellCheck='false'
									wrap='off'
									value={editorValue}
									onChange={(event) => {
										setEditorValue(event.target.value);
										setEditorDirty(true);
									}}
									onScroll={handleEditorScroll}
								/>
							</div>
						) : selectedEntry?.type === 'directory' ? (
							<div className='workspace-directory-state'>
								<FolderOpenRounded fontSize='inherit' />
								<strong>{selectedEntry.path}</strong>
								<p>
									This folder is selected. Create a new file
									here or open one of its existing files from
									the explorer.
								</p>
							</div>
						) : (
							<div className='workspace-empty-state'>
								Select a file from the explorer to edit it
								directly in the dashboard.
							</div>
						)}
					</div>
				</div>
			</article>

			<article
				className={`workspace-terminal-shell ${
					standalone ? 'standalone' : ''
				}`}>
				<div className='workspace-panel-head'>
					<div className='workspace-editor-headline'>
						<strong>Run and terminal</strong>
						<span>
							{terminalExecution
								? `${terminalExecution.label} | ${formatExecutionStatus(
										terminalExecution.status,
									)}`
								: 'Run build, test, or project commands without leaving the dashboard.'}
						</span>
					</div>
					<div className='workspace-terminal-head-actions'>
						{terminalExecution?.output && (
							<button
								type='button'
								className='ghost-button'
								onClick={copyTerminalOutput}>
								<ContentCopyRounded fontSize='small' />
								Copy output
							</button>
						)}
						<button
							type='button'
							className='ghost-button'
							onClick={() => {
								setTerminalExecution(null);
								setTerminalError('');
							}}>
							Clear
						</button>
					</div>
				</div>

				{commandPresets.length > 0 && (
					<div className='workspace-terminal-presets'>
						{commandPresets.map((preset) => (
							<button
								key={preset.id}
								type='button'
								className={`workspace-terminal-preset ${
									preset.primary ? 'primary' : ''
								}`}
								disabled={terminalBusy || executionRunning}
								onClick={() => runPreset(preset)}>
								<TerminalRounded fontSize='inherit' />
								<span>{preset.label}</span>
								<strong>{preset.cwdLabel}</strong>
							</button>
						))}
					</div>
				)}

				<div className='workspace-terminal-command-row'>
					<div className='workspace-terminal-command-copy'>
						<strong>Manual command</strong>
						<span>
							{selectedWorkingDirectory
								? `Runs inside ${selectedWorkingDirectory}`
								: terminalWorkingDirectory
									? `Runs inside ${terminalWorkingDirectory} by default. Select a folder to override it.`
									: 'Runs in the project root unless you select a folder first.'}
						</span>
					</div>
					<input
						className='workspace-terminal-input'
						value={commandValue}
						onChange={(event) =>
							setCommandValue(event.target.value)
						}
						onKeyDown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								runManualCommand();
							}
						}}
						placeholder='npm run build, mvn test, py -3 -m app doctor'
					/>
					<div className='workspace-terminal-command-actions'>
						<button
							type='button'
							className='success-button'
							disabled={
								terminalBusy ||
								executionRunning ||
								!commandValue.trim()
							}
							onClick={runManualCommand}>
							<TerminalRounded fontSize='small' />
							Run command
						</button>
						{terminalExecution?.status === 'running' && (
							<button
								type='button'
								className='danger-button'
								disabled={terminalBusy}
								onClick={stopExecution}>
								<StopRounded fontSize='small' />
								Stop
							</button>
						)}
					</div>
				</div>

				{terminalError && (
					<div className='workspace-error-banner'>
						{terminalError}
					</div>
				)}

				<div className='workspace-terminal-output'>
					{terminalExecution ? (
						<>
							<div className='workspace-terminal-meta'>
								<span>{terminalExecution.command}</span>
								<strong>
									{formatExecutionStatus(
										terminalExecution.status,
									)}
									{Number.isInteger(
										terminalExecution.exitCode,
									)
										? ` | exit ${terminalExecution.exitCode}`
										: ''}
								</strong>
							</div>
							<pre className='workspace-terminal-console'>
								{terminalExecution.output ||
									'Command started. Waiting for output...'}
							</pre>
						</>
					) : (
						<div className='workspace-empty-state workspace-terminal-empty'>
							Use the quick actions above or type any command you
							want to run inside this project. Java, Python,
							Maven, npm, and other local tools can all be
							executed here.
						</div>
					)}
					<div ref={terminalOutputRef} />
				</div>
			</article>
		</div>
	);
}

export default ProjectWorkspace;
