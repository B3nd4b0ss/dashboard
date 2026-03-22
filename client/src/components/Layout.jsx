import './Layout.css';
import { useState, useEffect } from 'react';
import { Link, Outlet } from 'react-router-dom';

function Layout() {
	const [darkMode, setDarkMode] = useState(false);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

	useEffect(() => {
		if (darkMode) {
			document.body.classList.add('dark');
		} else {
			document.body.classList.remove('dark');
		}
	}, [darkMode]);

	return (
		<div className={`app-layout ${darkMode ? 'dark' : ''}`}>
			<aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
				<div className='sidebar-header'>
					<button
						className='collapse-btn'
						onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
						{sidebarCollapsed ? '☰' : '←'}
					</button>
					{!sidebarCollapsed && <h2>Dashboard</h2>}
				</div>
				<nav className='sidebar-nav'>
					<Link to='/' className='nav-item'>
						<span className='nav-icon'>📁</span>
						{!sidebarCollapsed && <span>Projects</span>}
					</Link>
					<Link to='/databases' className='nav-item'>
						<span className='nav-icon'>🗄️</span>
						{!sidebarCollapsed && <span>Databases</span>}
					</Link>
					<Link to='/docker' className='nav-item'>
						<span className='nav-icon'>🐳</span>
						{!sidebarCollapsed && <span>Docker</span>}
					</Link>
					<Link to='/settings' className='nav-item'>
						<span className='nav-icon'>⚙️</span>
						{!sidebarCollapsed && <span>Settings</span>}
					</Link>
				</nav>
				<div className='sidebar-footer'>
					<button
						className='dark-mode-toggle'
						onClick={() => setDarkMode(!darkMode)}>
						{darkMode ? '☀️' : '🌙'}
					</button>
					{!sidebarCollapsed && (
						<span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
					)}
				</div>
			</aside>
			<main className='main-content'>
				<Outlet />
			</main>
		</div>
	);
}

export default Layout;
