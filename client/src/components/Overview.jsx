import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Overview.css';

const API = 'http://localhost:4000';

function Overview() {
	const [projects, setProjects] = useState([]);
	const [databases, setDatabases] = useState([]);
	const [form, setForm] = useState({
		name: '',
		frontend: '',
		backend: '',
		databaseId: '',
		frontendPort: '',
		backendPort: '',
	});
	const [showTerminal, setShowTerminal] = useState(false);
	const [terminalOutput, setTerminalOutput] = useState([]);
	const [isCreating, setIsCreating] = useState(false);
	const terminalRef = useRef(null);

	const loadProjects = async () => {
		const res = await axios.get(`${API}/projects`);
		setProjects(res.data);
	};

	const loadDatabases = async () => {
		const res = await axios.get(`${API}/databases`);
		setDatabases(res.data);
	};

	useEffect(() => {
		loadProjects();
		loadDatabases();
	}, []);

	useEffect(() => {
		if (terminalRef.current) {
			terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
		}
	}, [terminalOutput]);

	const createProject = async () => {
		if (!form.name) {
			alert('Please enter a project name!');
			return;
		}
		if (!form.frontend && !form.backend && !form.databaseId) {
			alert(
				'Please select at least one type (frontend/backend/database)!',
			);
			return;
		}
		if (form.frontend && !form.frontendPort) {
			alert('Please enter a port for the frontend!');
			return;
		}
		if (form.backend && !form.backendPort) {
			alert('Please enter a port for the backend!');
			return;
		}
		if (
			form.frontend &&
			form.backend &&
			form.frontendPort === form.backendPort
		) {
			alert('Frontend and backend ports must be different!');
			return;
		}

		// Show terminal and start creation
		setShowTerminal(true);
		setIsCreating(true);
		setTerminalOutput([
			{ type: 'log', message: '🚀 Starting project creation...' },
		]);

		try {
			const response = await fetch(`${API}/projects/create-stream`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form),
			});

			const reader = response.body.getReader();
			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value);
				const lines = chunk.split('\n');

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = JSON.parse(line.slice(6));
						setTerminalOutput((prev) => [...prev, data]);

						if (data.type === 'complete') {
							setIsCreating(false);
							setForm({
								name: '',
								frontend: '',
								backend: '',
								databaseId: '',
								frontendPort: '',
								backendPort: '',
							});
							loadProjects();
							// Close terminal after 3 seconds
							setTimeout(() => {
								setShowTerminal(false);
								setTerminalOutput([]);
							}, 3000);
						} else if (data.type === 'error') {
							setIsCreating(false);
						}
					}
				}
			}
		} catch (err) {
			setTerminalOutput((prev) => [
				...prev,
				{ type: 'error', message: `Error: ${err.message}` },
			]);
			setIsCreating(false);
		}
	};

	const startProject = async (name) => {
		await axios.post(`${API}/projects/${name}/start`);
		loadProjects();
	};
	const stopProject = async (name) => {
		await axios.post(`${API}/projects/${name}/stop`);
		loadProjects();
	};
	const deleteProject = async (name) => {
		await axios.delete(`${API}/projects/${name}/delete`);
		loadProjects();
	};
	const copyProject = async (name) => {
		const original = projects.find((p) => p.name === name);
		const newName = prompt('Enter new project name');
		if (!newName) return;
		const newFrontendPort = original.frontend
			? prompt('Enter new frontend port')
			: null;
		const newBackendPort = original.backend
			? prompt('Enter new backend port')
			: null;
		if (
			(original.frontend && !newFrontendPort) ||
			(original.backend && !newBackendPort)
		) {
			alert('Ports are required for existing services');
			return;
		}
		await axios.post(`${API}/projects/${name}/copy`, {
			newName,
			newFrontendPort,
			newBackendPort,
		});
		loadProjects();
	};

	const closeTerminal = () => {
		if (!isCreating) {
			setShowTerminal(false);
			setTerminalOutput([]);
		}
	};

	return (
		<div className='overview'>
			{/* Terminal Modal */}
			{showTerminal && (
				<div className='terminal-modal' onClick={closeTerminal}>
					<div
						className='terminal-container'
						onClick={(e) => e.stopPropagation()}>
						<div className='terminal-header'>
							<h3>Project Creation Log</h3>
							{!isCreating && (
								<button onClick={closeTerminal}>Close</button>
							)}
						</div>
						<div className='terminal-content' ref={terminalRef}>
							{terminalOutput.map((output, index) => (
								<div
									key={index}
									className={`terminal-line ${output.type}`}>
									{output.type === 'log' && '> '}
									{output.type === 'error' && '❌ '}
									{output.type === 'complete' && '✅ '}
									{output.message}
								</div>
							))}
							{isCreating && (
								<div className='terminal-cursor'>_</div>
							)}
						</div>
					</div>
				</div>
			)}

			<div className='create-form'>
				<input
					placeholder='Project Name'
					value={form.name}
					onChange={(e) => setForm({ ...form, name: e.target.value })}
				/>
				<select
					value={form.frontend}
					onChange={(e) =>
						setForm({ ...form, frontend: e.target.value })
					}>
					<option value=''>Frontend: None</option>
					<option value='vite-react'>Vite React</option>
				</select>
				{form.frontend && (
					<input
						placeholder='Frontend Port'
						type='number'
						value={form.frontendPort}
						onChange={(e) =>
							setForm({ ...form, frontendPort: e.target.value })
						}
					/>
				)}
				<select
					value={form.backend}
					onChange={(e) =>
						setForm({ ...form, backend: e.target.value })
					}>
					<option value=''>Backend: None</option>
					<option value='node'>Node</option>
				</select>
				{form.backend && (
					<input
						placeholder='Backend Port'
						type='number'
						value={form.backendPort}
						onChange={(e) =>
							setForm({ ...form, backendPort: e.target.value })
						}
					/>
				)}
				<select
					value={form.databaseId}
					onChange={(e) =>
						setForm({ ...form, databaseId: e.target.value })
					}>
					<option value=''>Database: None</option>
					{databases.map((db) => (
						<option key={db.id} value={db.id}>
							{db.name} (PostgreSQL, port {db.port})
						</option>
					))}
				</select>
				<button onClick={createProject}>Create</button>
			</div>

			<div className='project-list'>
				{projects.map((p) => (
					<div key={p.name} className='project-card'>
						<Link
							to={`/projects/${encodeURIComponent(p.name)}`}
							className='project-link'>
							<h3>{p.name}</h3>
						</Link>
						<p>Frontend: {p.frontend || '-'}</p>
						<p>Backend: {p.backend || '-'}</p>
						<p>Database: {p.databaseId ? 'Linked' : '-'}</p>
						<p>
							Ports: {p.frontend ? `FE: ${p.frontendPort}` : ''}
							{p.frontend && p.backend ? ', ' : ''}
							{p.backend ? `BE: ${p.backendPort}` : ''}
						</p>
						<p>Status: {p.status}</p>
						<div className='buttons'>
							<button
								className='start'
								onClick={() => startProject(p.name)}>
								Start
							</button>
							<button
								className='stop'
								onClick={() => stopProject(p.name)}>
								Stop
							</button>
							<button
								className='delete'
								onClick={() => deleteProject(p.name)}>
								Delete
							</button>
							<button
								className='copy'
								onClick={() => copyProject(p.name)}>
								Copy
							</button>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export default Overview;
