import './Layout.css';
import { useEffect, useRef, useState } from 'react';
import {
	NavLink,
	Outlet,
	useLocation,
	useSearchParams,
} from 'react-router-dom';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import SpaceDashboardRounded from '@mui/icons-material/SpaceDashboardRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import StorageRounded from '@mui/icons-material/StorageRounded';
import HubRounded from '@mui/icons-material/HubRounded';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import NotificationsRounded from '@mui/icons-material/NotificationsRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import InfoRounded from '@mui/icons-material/InfoRounded';
import DeleteSweepRounded from '@mui/icons-material/DeleteSweepRounded';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import {
	buildNextTextSearchParams,
	getSearchParamValue,
} from '../utils/searchParams';

const API = 'http://localhost:4000';
const NOTIFICATION_STORAGE_KEY = 'dashboard-notifications';
const NOTIFICATION_LIMIT = 12;
const MANUAL_ACTION_TTL_MS = 15000;

const PRIMARY_NAV = [
	{
		to: '/dashboard',
		label: 'Dashboard',
		icon: SpaceDashboardRounded,
	},
	{
		to: '/projects',
		label: 'Projects',
		icon: FolderRounded,
	},
	{
		to: '/tasks',
		label: 'Tasks',
		icon: ChecklistRounded,
	},
];

const SECONDARY_NAV = [
	{
		to: '/databases',
		label: 'Databases',
		icon: StorageRounded,
	},
	{
		to: '/docker',
		label: 'Docker',
		icon: HubRounded,
	},
	{
		to: '/settings',
		label: 'Settings',
		icon: SettingsRounded,
	},
];

function getSectionMeta(pathname) {
	if (pathname.startsWith('/projects/') && pathname.endsWith('/editor')) {
		return {
			label: 'Project Center',
			title: 'Project Editor',
			description:
				'Browse the workspace tree, edit files inline, and manage project code without leaving the dashboard.',
			searchPlaceholder: 'Search files, folders, or paths',
		};
	}

	if (pathname.startsWith('/projects/')) {
		return {
			label: 'Project Center',
			title: 'Project Detail',
			description:
				'Inspect runtime, edit ports, and jump from status to source code.',
			searchPlaceholder: 'Search services, ports, or files',
		};
	}

	if (pathname.startsWith('/docker/')) {
		return {
			label: 'Operations',
			title: 'Docker Stack',
			description:
				'Open a compose folder, inspect its services, and trace the runtime behind each YAML stack.',
			searchPlaceholder: 'Search services, ports, or stack files',
		};
	}

	switch (pathname) {
		case '/dashboard':
			return {
				label: 'Overview',
				title: 'Dashboard',
				description:
					'A personal control center for projects, tasks, runtime health, and databases.',
				searchPlaceholder: 'Search projects, tasks, or services',
			};
		case '/projects':
			return {
				label: 'Execution',
				title: 'Projects',
				description:
					'Launch, stop, and shape each project from a polished runtime board.',
				searchPlaceholder: 'Search projects and environments',
			};
		case '/composer':
			return {
				label: 'Composer',
				title: 'New Project',
				description:
					'Create a website, Python workspace, or Java project in a focused flow.',
				searchPlaceholder: 'Search starters and templates',
			};
		case '/tasks':
			return {
				label: 'Workflow',
				title: 'Tasks',
				description:
					'Track your personal workload with statuses, priorities, and due dates.',
				searchPlaceholder: 'Search tasks, statuses, or due dates',
			};
		case '/databases':
			return {
				label: 'Infrastructure',
				title: 'Databases',
				description:
					'Keep local services visible without breaking the new product shell.',
				searchPlaceholder: 'Search databases and containers',
			};
		case '/docker':
			return {
				label: 'Operations',
				title: 'Docker',
				description:
					'Monitor daemon health, container runtime state, logs, and local images.',
				searchPlaceholder: 'Search containers, images, or statuses',
			};
		case '/settings':
			return {
				label: 'Controls',
				title: 'Settings',
				description:
					'Set GitHub publishing defaults and other workspace-wide behavior.',
				searchPlaceholder: 'Search settings and preferences',
			};
		default:
			return {
				label: 'System',
				title: 'Launchpad',
				description:
					'A responsive desktop shell for your local project management workflow.',
				searchPlaceholder: 'Search the dashboard',
			};
	}
}

function loadStoredNotifications() {
	try {
		const stored = window.localStorage.getItem(NOTIFICATION_STORAGE_KEY);
		if (!stored) {
			return [];
		}

		const parsed = JSON.parse(stored);
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		return [];
	}
}

function buildNotification(type, title, message) {
	return {
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		type,
		title,
		message,
		read: false,
		createdAt: new Date().toISOString(),
	};
}

function getNotificationTime(createdAt) {
	return new Date(createdAt).toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
	});
}

function isTypingElement(target) {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable ||
			['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
	);
}

function supportsInlineTopbarSearch(pathname) {
	if (pathname.startsWith('/projects/') && pathname.endsWith('/editor')) {
		return true;
	}

	return ['/dashboard', '/projects', '/tasks', '/databases', '/docker'].includes(
		pathname,
	);
}

function Layout() {
	const location = useLocation();
	const [searchParams, setSearchParams] = useSearchParams();
	const sectionMeta = getSectionMeta(location.pathname);
	const [darkMode, setDarkMode] = useState(() => {
		return window.localStorage.getItem('dashboard-theme') === 'dark';
	});
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	const [notificationsOpen, setNotificationsOpen] = useState(false);
	const [notifications, setNotifications] = useState(() =>
		loadStoredNotifications(),
	);
	const projectStatusRef = useRef(new Map());
	const manualActionsRef = useRef(new Map());
	const notificationsReadyRef = useRef(false);
	const notificationsErrorRef = useRef(false);
	const introNoticeRef = useRef(false);
	const topbarSearchInputRef = useRef(null);
	const topbarQuery = getSearchParamValue(searchParams, 'q');
	const usesInlineTopbarSearch = supportsInlineTopbarSearch(location.pathname);

	useEffect(() => {
		document.body.classList.toggle('dark', darkMode);
		window.localStorage.setItem(
			'dashboard-theme',
			darkMode ? 'dark' : 'light',
		);
	}, [darkMode]);

	useEffect(() => {
		setMobileSidebarOpen(false);
		setNotificationsOpen(false);
	}, [location.pathname]);

	useEffect(() => {
		window.localStorage.setItem(
			NOTIFICATION_STORAGE_KEY,
			JSON.stringify(notifications.slice(0, NOTIFICATION_LIMIT)),
		);
	}, [notifications]);

	useEffect(() => {
		if (!introNoticeRef.current && notifications.length === 0) {
			introNoticeRef.current = true;
			setNotifications([
				buildNotification(
					'update',
					'Notifications are live',
					'The bell now tracks project crashes, recoveries, and runtime updates.',
				),
			]);
		}
	}, [notifications]);

	useEffect(() => {
		const handleProjectAction = (event) => {
			const projectName = event.detail?.projectName;
			const action = event.detail?.action;

			if (!projectName || !action) {
				return;
			}

			manualActionsRef.current.set(projectName.toLowerCase(), {
				action,
				createdAt: Date.now(),
			});
		};

		window.addEventListener(
			'dashboard:project-action',
			handleProjectAction,
		);

		return () => {
			window.removeEventListener(
				'dashboard:project-action',
				handleProjectAction,
			);
		};
	}, []);

	useEffect(() => {
		const markNotificationsRead = () => {
			setNotifications((previous) =>
				previous.map((entry) => ({ ...entry, read: true })),
			);
		};

		if (notificationsOpen) {
			markNotificationsRead();
		}
	}, [notificationsOpen]);

	useEffect(() => {
		const handleGlobalSearchShortcut = (event) => {
			const key = event.key.toLowerCase();

			if ((event.metaKey || event.ctrlKey) && key === 'k') {
				event.preventDefault();
				topbarSearchInputRef.current?.focus();
				topbarSearchInputRef.current?.select();
				return;
			}

			if (!isTypingElement(event.target) && key === '/') {
				event.preventDefault();
				topbarSearchInputRef.current?.focus();
				topbarSearchInputRef.current?.select();
			}
		};

		window.addEventListener('keydown', handleGlobalSearchShortcut);

		return () => {
			window.removeEventListener('keydown', handleGlobalSearchShortcut);
		};
	}, []);

	useEffect(() => {
		let active = true;

		const syncNotifications = async () => {
			try {
				const response = await fetch(`${API}/projects`);
				if (!response.ok) {
					throw new Error('Unable to load projects');
				}

				const projects = await response.json();
				if (!active) {
					return;
				}

				const nextStatuses = new Map();
				const nextNotifications = [];
				const now = Date.now();

				for (const project of projects) {
					const projectKey = project.name.toLowerCase();
					const previousStatus =
						projectStatusRef.current.get(projectKey);
					const currentStatus = project.status;
					const manualAction =
						manualActionsRef.current.get(projectKey);
					const isManualActionFresh =
						manualAction &&
						now - manualAction.createdAt <= MANUAL_ACTION_TTL_MS;

					nextStatuses.set(projectKey, currentStatus);

					if (!notificationsReadyRef.current) {
						continue;
					}

					if (!previousStatus || previousStatus === currentStatus) {
						continue;
					}

					if (currentStatus === 'partial') {
						nextNotifications.push(
							buildNotification(
								'crash',
								`${project.name} needs attention`,
								'One or more services stopped unexpectedly while the project was running. Open the project runtime logs to inspect what failed.',
							),
						);
						continue;
					}

					if (currentStatus === 'running') {
						nextNotifications.push(
							buildNotification(
								'update',
								`${project.name} is live`,
								isManualActionFresh &&
									manualAction.action === 'start'
									? 'Your project finished starting and is now running.'
									: 'The runtime recovered and is running again.',
							),
						);
						manualActionsRef.current.delete(projectKey);
						continue;
					}

					if (
						currentStatus === 'stopped' &&
						previousStatus !== 'stopped' &&
						!(isManualActionFresh && manualAction.action === 'stop')
					) {
						nextNotifications.push(
							buildNotification(
								'crash',
								`${project.name} stopped unexpectedly`,
								'The runtime went offline without a manual stop action from the dashboard. Open the project runtime logs to see the last captured output.',
							),
						);
					}

					if (
						isManualActionFresh &&
						((manualAction.action === 'stop' &&
							currentStatus === 'stopped') ||
							(manualAction.action === 'start' &&
								(currentStatus === 'running' ||
									currentStatus === 'partial')))
					) {
						manualActionsRef.current.delete(projectKey);
					}
				}

				for (const [
					projectKey,
					manualAction,
				] of manualActionsRef.current.entries()) {
					if (now - manualAction.createdAt > MANUAL_ACTION_TTL_MS) {
						manualActionsRef.current.delete(projectKey);
					}
				}

				projectStatusRef.current = nextStatuses;
				notificationsReadyRef.current = true;
				notificationsErrorRef.current = false;

				if (nextNotifications.length > 0) {
					setNotifications((previous) =>
						[...nextNotifications, ...previous].slice(
							0,
							NOTIFICATION_LIMIT,
						),
					);
				}
			} catch (error) {
				if (!active || notificationsErrorRef.current) {
					return;
				}

				notificationsErrorRef.current = true;
				setNotifications((previous) =>
					[
						buildNotification(
							'warning',
							'Notification sync paused',
							'The dashboard could not refresh project status updates from the backend.',
						),
						...previous,
					].slice(0, NOTIFICATION_LIMIT),
				);
			}
		};

		syncNotifications();
		const intervalId = window.setInterval(syncNotifications, 8000);

		return () => {
			active = false;
			window.clearInterval(intervalId);
		};
	}, []);

	const closeMobileSidebar = () => {
		setMobileSidebarOpen(false);
	};

	const unreadCount = notifications.filter((entry) => !entry.read).length;

	const clearNotifications = () => {
		setNotifications([]);
	};

	const updateTopbarSearch = (nextValue) => {
		setSearchParams(
			buildNextTextSearchParams(searchParams, 'q', nextValue),
			{ replace: true },
		);
	};

	const handleTopbarSearchSubmit = (event) => {
		event.preventDefault();

		if (usesInlineTopbarSearch || !topbarQuery.trim()) {
			return;
		}

		topbarSearchInputRef.current?.blur();

		if (typeof window.find === 'function') {
			window.find(
				topbarQuery.trim(),
				false,
				false,
				true,
				false,
				false,
				false,
			);
		}
	};

	const renderNavItems = (items) =>
		items.map((item) => {
			const Icon = item.icon;

			return (
				<NavLink
					key={item.to}
					to={item.to}
					end={!['/projects', '/docker'].includes(item.to)}
					className={({ isActive }) =>
						`sidebar-link ${isActive ? 'active' : ''}`
					}
					onClick={() => {
						if (window.innerWidth <= 1080) {
							closeMobileSidebar();
						}
					}}>
					<span className='sidebar-link-icon'>
						<Icon fontSize='small' />
					</span>
					{!sidebarCollapsed && (
						<span className='sidebar-link-label'>{item.label}</span>
					)}
				</NavLink>
			);
		});

	return (
		<div
			className={`workspace-layout ${darkMode ? 'dark' : ''} ${
				sidebarCollapsed ? 'sidebar-collapsed' : ''
			} ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
			<div
				className={`sidebar-overlay ${
					mobileSidebarOpen ? 'visible' : ''
				}`}
				onClick={closeMobileSidebar}
			/>

			<aside className='workspace-sidebar'>
				<div className='sidebar-top'>
					<div className='brand-cluster'>
						<div className='brand-mark'>
							<AutoAwesomeRounded />
						</div>
						{!sidebarCollapsed && (
							<div className='brand-copy'>
								<span>Personal Control</span>
								<strong>Launchpad Desk</strong>
							</div>
						)}
					</div>

					<div className='sidebar-top-actions'>
						<button
							type='button'
							className='sidebar-icon-button mobile-only'
							onClick={closeMobileSidebar}>
							<CloseRounded fontSize='small' />
						</button>
						<button
							type='button'
							className='sidebar-icon-button desktop-only'
							onClick={() =>
								setSidebarCollapsed((value) => !value)
							}>
							{sidebarCollapsed ? (
								<ChevronRightRounded fontSize='small' />
							) : (
								<ChevronLeftRounded fontSize='small' />
							)}
						</button>
					</div>
				</div>

				<div className='sidebar-group'>
					{!sidebarCollapsed && (
						<span className='sidebar-group-label'>Manage</span>
					)}
					<nav className='sidebar-nav'>
						{renderNavItems(PRIMARY_NAV)}
					</nav>
				</div>

				<div className='sidebar-group secondary'>
					{!sidebarCollapsed && (
						<span className='sidebar-group-label'>System</span>
					)}
					<nav className='sidebar-nav'>
						{renderNavItems(SECONDARY_NAV)}
					</nav>
				</div>

				<div className='sidebar-footer'>
					{!sidebarCollapsed && (
						<div className='sidebar-footer-copy'>
							<span>Theme</span>
							<strong>
								{darkMode ? 'Night mode' : 'Studio light'}
							</strong>
						</div>
					)}
					<button
						type='button'
						className='sidebar-icon-button'
						onClick={() => setDarkMode((value) => !value)}>
						{darkMode ? (
							<LightModeRounded fontSize='small' />
						) : (
							<DarkModeRounded fontSize='small' />
						)}
					</button>
				</div>
			</aside>

			<div className='workspace-main'>
				<header className='workspace-topbar'>
					<div className='topbar-leading'>
						<button
							type='button'
							className='topbar-menu-button'
							onClick={() => setMobileSidebarOpen(true)}>
							<MenuRounded fontSize='small' />
						</button>
						<div className='page-copy'>
							<span>{sectionMeta.label}</span>
							<h1>{sectionMeta.title}</h1>
							<p>{sectionMeta.description}</p>
						</div>
					</div>

					<div className='topbar-actions'>
						<form
							className='topbar-search'
							role='search'
							onSubmit={handleTopbarSearchSubmit}>
							<SearchRounded fontSize='small' />
							<input
								ref={topbarSearchInputRef}
								type='search'
								placeholder={sectionMeta.searchPlaceholder}
								value={topbarQuery}
								onChange={(event) =>
									updateTopbarSearch(event.target.value)
								}
								onKeyDown={(event) => {
									if (event.key === 'Escape' && topbarQuery) {
										event.preventDefault();
										updateTopbarSearch('');
									}
								}}
								autoComplete='off'
								aria-label={sectionMeta.searchPlaceholder}
								title={
									usesInlineTopbarSearch
										? 'Filter the visible content on this page'
										: 'Press Enter to search the visible text on this page'
								}
							/>
						</form>

						<div
							className={`notification-shell ${notificationsOpen ? 'open' : ''}`}>
							<button
								type='button'
								className='topbar-icon-button'
								onClick={() => {
									setNotificationsOpen((value) => !value);
								}}>
								<NotificationsRounded fontSize='small' />
								{unreadCount > 0 && (
									<span className='notification-indicator'>
										{unreadCount}
									</span>
								)}
							</button>

							{notificationsOpen && (
								<div className='notification-dropdown'>
									<div className='notification-dropdown-head'>
										<div>
											<span>Notifications</span>
											<strong>Crashes and updates</strong>
										</div>
										{notifications.length > 0 && (
											<button
												type='button'
												className='notification-clear-button'
												onClick={clearNotifications}>
												<DeleteSweepRounded fontSize='small' />
												Clear
											</button>
										)}
									</div>

									<div className='notification-list'>
										{notifications.length > 0 ? (
											notifications.map((entry) => (
												<article
													key={entry.id}
													className={`notification-card ${entry.type} ${
														entry.read ? 'read' : ''
													}`}>
													<div
														className={`notification-icon ${entry.type}`}>
														{entry.type ===
														'crash' ? (
															<WarningAmberRounded fontSize='small' />
														) : entry.type ===
														  'warning' ? (
															<InfoRounded fontSize='small' />
														) : (
															<CheckCircleRounded fontSize='small' />
														)}
													</div>
													<div className='notification-copy'>
														<div className='notification-meta'>
															<strong>
																{entry.title}
															</strong>
															<span>
																{getNotificationTime(
																	entry.createdAt,
																)}
															</span>
														</div>
														<p>{entry.message}</p>
													</div>
												</article>
											))
										) : (
											<div className='notification-empty'>
												<strong>
													No alerts right now
												</strong>
												<p>
													New runtime crashes and
													project updates will appear
													here automatically.
												</p>
											</div>
										)}
									</div>
								</div>
							)}
						</div>
					</div>
				</header>

				<div className='workspace-content'>
					<Outlet />
				</div>
			</div>
		</div>
	);
}

export default Layout;
