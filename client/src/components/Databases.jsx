import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import SurfaceSelect from './SurfaceSelect';
import './Databases.css';

const API = 'http://localhost:4000';
const DATABASE_TYPE_OPTIONS = [
	{
		value: 'postgres',
		label: 'PostgreSQL',
		description: 'Relational database with strong SQL tooling.',
	},
	{
		value: 'mysql',
		label: 'MySQL',
		description: 'Popular relational database for app backends.',
	},
	{
		value: 'mongodb',
		label: 'MongoDB',
		description: 'Document database for flexible schemas.',
	},
];

function Databases() {
	const location = useLocation();
	const navigate = useNavigate();
	const [databases, setDatabases] = useState([]);
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [newDb, setNewDb] = useState({
		name: '',
		type: 'postgres',
		port: '',
		withClient: false,
	});
	const [statuses, setStatuses] = useState({});
	const [showConnectionModal, setShowConnectionModal] = useState(false);
	const [selectedDatabase, setSelectedDatabase] = useState(null);
	const [copied, setCopied] = useState(false);
	const [showCreateTerminal, setShowCreateTerminal] = useState(false);
	const [createTerminalOutput, setCreateTerminalOutput] = useState([]);
	const [createProgress, setCreateProgress] = useState(0);
	const [isCreatingDatabase, setIsCreatingDatabase] = useState(false);
	const projectComposerDraft = location.state?.projectComposerDraft || null;
	const projectComposerReturnPath =
		location.state?.returnToProjectComposerPath || '/composer';
	const isProjectComposerFlow = Boolean(
		location.state?.fromProjectComposer && projectComposerDraft,
	);
	const createOutputEndRef = useRef(null);

	useEffect(() => {
		loadDatabases();
	}, []);

	useEffect(() => {
		if (isProjectComposerFlow) {
			setShowCreateForm(true);
		}
	}, [isProjectComposerFlow]);

	useEffect(() => {
		createOutputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [createTerminalOutput]);

	const loadDatabases = async () => {
		try {
			const res = await axios.get(`${API}/databases`);
			setDatabases(res.data);
			// Fetch statuses for all databases
			await fetchAllStatuses(res.data);
		} catch (err) {
			console.error('Failed to load databases:', err);
			alert(
				'Failed to load databases. Make sure the backend is running.',
			);
		}
	};

	const fetchAllStatuses = async (dbList) => {
		const newStatuses = {};
		for (const db of dbList) {
			await fetchSingleStatus(db.id, newStatuses);
		}
		setStatuses(newStatuses);
	};

	const fetchSingleStatus = async (id, statusMap = null) => {
		try {
			const statusRes = await axios.get(`${API}/databases/${id}/status`);
			const status = statusRes.data.status;
			if (statusMap) {
				statusMap[id] = status;
			} else {
				setStatuses((prev) => ({ ...prev, [id]: status }));
			}
		} catch (err) {
			console.error(`Failed to fetch status for ${id}:`, err);
			if (statusMap) {
				statusMap[id] = 'error';
			} else {
				setStatuses((prev) => ({ ...prev, [id]: 'error' }));
			}
		}
	};

	const refreshStatus = (id) => {
		fetchSingleStatus(id);
	};

	const updateCreateProgressFromLog = (message) => {
		if (message.includes('Preparing')) {
			setCreateProgress(10);
		} else if (message.includes('Reserved database port')) {
			setCreateProgress((previous) => Math.max(previous, 24));
		} else if (message.includes('Reserved Adminer port')) {
			setCreateProgress((previous) => Math.max(previous, 34));
		} else if (
			message.includes('Creating Docker Compose stack directory')
		) {
			setCreateProgress((previous) => Math.max(previous, 48));
		} else if (message.includes('Writing docker-compose.yml')) {
			setCreateProgress((previous) => Math.max(previous, 66));
		} else if (message.includes('Starting Docker Compose services')) {
			setCreateProgress((previous) => Math.max(previous, 82));
		} else if (message.includes('Database stack started successfully')) {
			setCreateProgress((previous) => Math.max(previous, 94));
		} else if (message.includes('Database created successfully')) {
			setCreateProgress(100);
		}
	};

	const closeCreateTerminal = () => {
		if (isCreatingDatabase) {
			return;
		}

		setShowCreateTerminal(false);
		setCreateTerminalOutput([]);
		setCreateProgress(0);
	};

	const createDatabase = async () => {
		if (!newDb.name) {
			alert('Please enter a database name');
			return;
		}

		setShowCreateTerminal(true);
		setIsCreatingDatabase(true);
		setCreateProgress(0);
		setCreateTerminalOutput([
			{
				type: 'log',
				message: 'Starting database creation...',
				timestamp: new Date().toLocaleTimeString(),
			},
		]);

		try {
			const response = await fetch(`${API}/databases/create-stream`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newDb),
			});

			if (!response.ok) {
				const errorData = await response
					.json()
					.catch(() => ({ error: 'Database creation failed.' }));
				throw new Error(errorData.error || 'Database creation failed.');
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

					setCreateTerminalOutput((previous) => [...previous, entry]);

					if (data.type === 'log') {
						updateCreateProgressFromLog(data.message);
					}

					if (data.type === 'complete') {
						const createdDatabase = data.database;
						setCreateProgress(100);
						setIsCreatingDatabase(false);

						if (isProjectComposerFlow && projectComposerDraft) {
							navigate(projectComposerReturnPath, {
								state: {
									projectComposerDraft: {
										...projectComposerDraft,
										databaseId: createdDatabase.id,
									},
									composerMessage: `"${createdDatabase.name}" is ready and linked to your new project draft.`,
								},
							});
							return;
						}

						setShowCreateForm(false);
						setNewDb({
							name: '',
							type: 'postgres',
							port: '',
							withClient: false,
						});
						await loadDatabases();

						window.setTimeout(() => {
							setShowCreateTerminal(false);
							setCreateTerminalOutput([]);
							setCreateProgress(0);
						}, 1800);
					}

					if (data.type === 'error') {
						setIsCreatingDatabase(false);
					}
				}
			}
		} catch (error) {
			setCreateTerminalOutput((previous) => [
				...previous,
				{
					type: 'error',
					message: `Error: ${error.message}`,
					timestamp: new Date().toLocaleTimeString(),
				},
			]);
			setIsCreatingDatabase(false);
		}
	};

	const deleteDatabase = async (id) => {
		if (!confirm('Delete database and all data?')) return;
		try {
			await axios.delete(`${API}/databases/${id}`);
			loadDatabases();
		} catch (err) {
			alert('Failed to delete database');
		}
	};

	const startDatabase = async (id) => {
		try {
			await axios.post(`${API}/databases/${id}/start`);
			await refreshStatus(id);
		} catch (err) {
			alert(err.response?.data?.error || 'Failed to start database');
		}
	};

	const stopDatabase = async (id) => {
		try {
			await axios.post(`${API}/databases/${id}/stop`);
			await refreshStatus(id);
		} catch (err) {
			alert(err.response?.data?.error || 'Failed to stop database');
		}
	};

	const startClient = async (id) => {
		try {
			await axios.post(`${API}/databases/${id}/client/start`);
			await refreshStatus(id); // optional, but client status is separate
		} catch (err) {
			alert(err.response?.data?.error || 'Failed to start client');
		}
	};

	const stopClient = async (id) => {
		try {
			await axios.post(`${API}/databases/${id}/client/stop`);
			await refreshStatus(id);
		} catch (err) {
			alert(err.response?.data?.error || 'Failed to stop client');
		}
	};

	const returnToProjectComposer = () => {
		if (!projectComposerDraft) {
			navigate(projectComposerReturnPath);
			return;
		}

		navigate(projectComposerReturnPath, {
			state: {
				projectComposerDraft,
				composerMessage: 'Project draft restored.',
			},
		});
	};

	const showConnectionString = (db) => {
		setSelectedDatabase(db);
		setShowConnectionModal(true);
	};

	const copyToClipboard = async (db) => {
		if (!db || !db.credentials) return;
		const { user, password, database, port, host } = db.credentials;
		let conn;
		if (db.type === 'mongodb') {
			conn = `mongodb://${host}:${port}/${database}`;
		} else {
			conn = `${db.type}://${user}:${password}@${host}:${port}/${database}`;
		}
		try {
			await navigator.clipboard.writeText(conn);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			alert('Failed to copy to clipboard');
		}
	};

	const getStatusBadge = (status) => {
		switch (status) {
			case 'running':
				return <span className='status-badge running'>● Running</span>;
			case 'stopped':
				return <span className='status-badge stopped'>● Stopped</span>;
			case 'error':
				return <span className='status-badge error'>⚠️ Error</span>;
			default:
				return <span className='status-badge unknown'>? Unknown</span>;
		}
	};

	return (
		<div className='databases-container'>
			{showCreateTerminal && (
				<div className='terminal-modal' onClick={closeCreateTerminal}>
					<div
						className='terminal-container'
						onClick={(event) => event.stopPropagation()}>
						<div className='terminal-header'>
							<div>
								<p className='terminal-label'>Provisioning</p>
								<h3>Database creation log</h3>
							</div>
							<button
								type='button'
								onClick={closeCreateTerminal}
								disabled={isCreatingDatabase}>
								Close
							</button>
						</div>
						<div className='progress-bar-container'>
							<div
								className='progress-bar'
								style={{ width: `${createProgress}%` }}
							/>
						</div>
						<div className='terminal-content'>
							{createTerminalOutput.map((entry, index) => (
								<div
									key={`${entry.timestamp}-${index}`}
									className={`terminal-line ${entry.type}`}>
									<span className='timestamp'>
										[{entry.timestamp}]
									</span>
									{entry.message}
								</div>
							))}
							{isCreatingDatabase && (
								<div className='terminal-cursor' />
							)}
							<div ref={createOutputEndRef} />
						</div>
					</div>
				</div>
			)}

			<div className='databases-header'>
				<h2>Databases</h2>
				<div>
					<button
						onClick={() => loadDatabases()}
						className='refresh-all-btn'>
						🔄 Refresh All
					</button>
					<button onClick={() => setShowCreateForm(!showCreateForm)}>
						{showCreateForm ? 'Cancel' : 'Create Database'}
					</button>
				</div>
			</div>

			{isProjectComposerFlow && (
				<div className='database-context-banner'>
					<div className='database-context-copy'>
						<strong>Create a database for your new project</strong>
						<p>
							This page opened from the project composer. As soon
							as you create a database, you will be sent back to
							`/composer` and it will already be selected.
						</p>
					</div>
					<button
						type='button'
						className='database-context-action'
						onClick={returnToProjectComposer}>
						Back to project draft
					</button>
				</div>
			)}

			{showCreateForm && (
				<div className='create-db-form'>
					<div className='database-form-grid'>
						<label className='database-field'>
							<span>Database name</span>
							<input
								placeholder='project-db'
								value={newDb.name}
								onChange={(e) =>
									setNewDb({ ...newDb, name: e.target.value })
								}
							/>
						</label>

						<div className='database-field'>
							<span>Database type</span>
							<SurfaceSelect
								value={newDb.type}
								onChange={(nextValue) =>
									setNewDb({ ...newDb, type: nextValue })
								}
								options={DATABASE_TYPE_OPTIONS}
								className='database-surface-select'
							/>
						</div>

						<label className='database-field'>
							<span>Port</span>
							<input
								placeholder='Optional'
								type='number'
								value={newDb.port}
								onChange={(e) =>
									setNewDb({ ...newDb, port: e.target.value })
								}
							/>
						</label>

						<label className='database-field database-toggle-field'>
							<span>Client</span>
							<div className='database-toggle-row'>
								<input
									type='checkbox'
									checked={newDb.withClient}
									onChange={(e) =>
										setNewDb({
											...newDb,
											withClient: e.target.checked,
										})
									}
								/>
								<strong>Create with Adminer client</strong>
							</div>
						</label>
					</div>

					<div className='database-form-actions'>
						<button
							type='button'
							className='database-create-button'
							onClick={createDatabase}
							disabled={isCreatingDatabase}>
							{isCreatingDatabase
								? 'Creating...'
								: 'Create database'}
						</button>
					</div>
				</div>
			)}

			<div className='database-list'>
				{databases.map((db) => (
					<div key={db.id} className='database-card'>
						<h3>
							{db.clientPort ? (
								<a
									href={`http://localhost:${db.clientPort}`}
									target='_blank'
									rel='noopener noreferrer'>
									{db.name}
								</a>
							) : (
								db.name
							)}
						</h3>
						<p>Type: {db.type}</p>
						<p>Port: {db.port}</p>
						<p>Container: {db.containerName}</p>
						<div className='status-row'>
							<span className='status-label'>Status:</span>
							{getStatusBadge(statuses[db.id])}
							<button
								className='refresh-status'
								onClick={() => refreshStatus(db.id)}
								title='Refresh status'>
								⟳
							</button>
						</div>
						{db.type !== 'mongodb' && (
							<>
								<p>User: {db.credentials.user}</p>
								<p>Password: {db.credentials.password}</p>
							</>
						)}
						{db.clientPort && (
							<p>
								Adminer:{' '}
								<a
									href={`http://localhost:${db.clientPort}`}
									target='_blank'
									rel='noopener noreferrer'>
									port {db.clientPort}
								</a>
							</p>
						)}

						{/* Database Control Buttons */}
						<div className='database-buttons'>
							{statuses[db.id] === 'running' ? (
								<button onClick={() => stopDatabase(db.id)}>
									Stop DB
								</button>
							) : (
								<button onClick={() => startDatabase(db.id)}>
									Start DB
								</button>
							)}
							<button onClick={() => deleteDatabase(db.id)}>
								Delete
							</button>
						</div>

						<div className='database-buttons connection-button'>
							<button
								className='connection-btn'
								onClick={() => showConnectionString(db)}>
								🔗 Show Connection String
							</button>
						</div>
					</div>
				))}
			</div>

			{/* Connection String Modal */}
			{showConnectionModal && selectedDatabase && (
				<div
					className='modal-overlay'
					onClick={() => setShowConnectionModal(false)}>
					<div
						className='modal-content'
						onClick={(e) => e.stopPropagation()}>
						<div className='modal-header'>
							<h3>
								Database Connection String -{' '}
								{selectedDatabase.name}
							</h3>
							<button
								className='modal-close'
								onClick={() => setShowConnectionModal(false)}>
								×
							</button>
						</div>
						<div className='modal-body'>
							<div className='connection-string-container'>
								<div className='connection-string'>
									<span className='connection-string-label'>
										{selectedDatabase.type.toUpperCase()}{' '}
										URL:
									</span>
									<div className='connection-string-value'>
										<code>
											{selectedDatabase.type === 'mongodb'
												? `mongodb://${selectedDatabase.credentials.host}:${selectedDatabase.credentials.port}/${selectedDatabase.credentials.database}`
												: `${selectedDatabase.type}://${selectedDatabase.credentials.user}:********@${selectedDatabase.credentials.host}:${selectedDatabase.credentials.port}/${selectedDatabase.credentials.database}`}
										</code>
									</div>
								</div>
								<div className='connection-string-full'>
									<span className='connection-string-label'>
										Full connection string:
									</span>
									<div className='connection-string-value'>
										<code>
											{selectedDatabase.type === 'mongodb'
												? `mongodb://${selectedDatabase.credentials.host}:${selectedDatabase.credentials.port}/${selectedDatabase.credentials.database}`
												: `${selectedDatabase.type}://${selectedDatabase.credentials.user}:${selectedDatabase.credentials.password}@${selectedDatabase.credentials.host}:${selectedDatabase.credentials.port}/${selectedDatabase.credentials.database}`}
										</code>
									</div>
								</div>
								<div className='connection-actions'>
									<button
										className='copy-btn'
										onClick={() =>
											copyToClipboard(selectedDatabase)
										}>
										{copied
											? '✓ Copied!'
											: '📋 Copy Full String'}
									</button>
								</div>
								<div className='connection-note'>
									<small>
										⚠️ Keep this password secret! It grants
										full access to your database.
									</small>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export default Databases;
