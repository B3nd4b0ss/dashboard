import { useState, useEffect } from 'react';
import axios from 'axios';
import './Databases.css';

const API = 'http://localhost:4000';

function Databases() {
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

	useEffect(() => {
		loadDatabases();
	}, []);

	const loadDatabases = async () => {
		try {
			const res = await axios.get(`${API}/databases`);
			setDatabases(res.data);
			// Fetch status for each database
			for (const db of res.data) {
				try {
					const statusRes = await axios.get(
						`${API}/databases/${db.id}/status`,
					);
					setStatuses((prev) => ({
						...prev,
						[db.id]: statusRes.data.status,
					}));
				} catch (err) {
					console.error(
						`Failed to fetch status for ${db.name}:`,
						err,
					);
					setStatuses((prev) => ({ ...prev, [db.id]: 'error' }));
				}
			}
		} catch (err) {
			console.error('Failed to load databases:', err);
			alert(
				'Failed to load databases. Make sure the backend is running.',
			);
		}
	};

	const createDatabase = async () => {
		if (!newDb.name) {
			alert('Please enter a database name');
			return;
		}
		try {
			await axios.post(`${API}/databases`, newDb);
			setShowCreateForm(false);
			setNewDb({
				name: '',
				type: 'postgres',
				port: '',
				withClient: false,
			});
			loadDatabases();
		} catch (err) {
			alert(err.response?.data?.error || 'Failed to create database');
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
			loadDatabases(); // reload to update status
		} catch (err) {
			alert(err.response?.data?.error || 'Failed to start database');
		}
	};

	const stopDatabase = async (id) => {
		try {
			await axios.post(`${API}/databases/${id}/stop`);
			loadDatabases();
		} catch (err) {
			alert(err.response?.data?.error || 'Failed to stop database');
		}
	};

	const startClient = async (id) => {
		try {
			await axios.post(`${API}/databases/${id}/client/start`);
			loadDatabases();
		} catch (err) {
			alert(err.response?.data?.error || 'Failed to start client');
		}
	};

	const stopClient = async (id) => {
		try {
			await axios.post(`${API}/databases/${id}/client/stop`);
			loadDatabases();
		} catch (err) {
			alert(err.response?.data?.error || 'Failed to stop client');
		}
	};

	const showConnectionString = (db) => {
		setSelectedDatabase(db);
		setShowConnectionModal(true);
	};

	const copyToClipboard = async (db) => {
		if (!db || !db.credentials) return;
		const { user, password, database, port, host } = db.credentials;
		const conn = `postgresql://${user}:${password}@${host}:${port}/${database}`;

		try {
			await navigator.clipboard.writeText(conn);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			alert('Failed to copy to clipboard');
		}
	};

	return (
		<div className='databases-container'>
			<div className='databases-header'>
				<h2>Databases</h2>
				<button onClick={() => setShowCreateForm(!showCreateForm)}>
					{showCreateForm ? 'Cancel' : 'Create Database'}
				</button>
			</div>

			{showCreateForm && (
				<div className='create-db-form'>
					<input
						placeholder='Database Name'
						value={newDb.name}
						onChange={(e) =>
							setNewDb({ ...newDb, name: e.target.value })
						}
					/>
					<select
						value={newDb.type}
						onChange={(e) =>
							setNewDb({ ...newDb, type: e.target.value })
						}>
						<option value='postgres'>PostgreSQL</option>
					</select>
					<input
						placeholder='Port (optional)'
						type='number'
						value={newDb.port}
						onChange={(e) =>
							setNewDb({ ...newDb, port: e.target.value })
						}
					/>
					<label
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '5px',
						}}>
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
						Create with Adminer client
					</label>
					<button onClick={createDatabase}>Create</button>
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
						<p>
							Status:
							<span
								className={`status ${statuses[db.id] === 'error' ? 'error' : statuses[db.id]}`}>
								{statuses[db.id] === 'error'
									? 'Docker error'
									: statuses[db.id] || 'unknown'}
							</span>
						</p>
						<p>User: {db.credentials.user}</p>
						<p>Password: {db.credentials.password}</p>
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

						{/* Database Control Buttons - Row 1 */}
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
						{/* Connection String Button - Row 3 */}
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
										PostgreSQL URL:
									</span>
									<div className='connection-string-value'>
										<code>
											postgresql://
											{selectedDatabase.credentials.user}
											:********@
											{selectedDatabase.credentials.host}:
											{selectedDatabase.credentials.port}/
											{
												selectedDatabase.credentials
													.database
											}
										</code>
									</div>
								</div>
								<div className='connection-string-full'>
									<span className='connection-string-label'>
										Full connection string:
									</span>
									<div className='connection-string-value'>
										<code>
											postgresql://
											{selectedDatabase.credentials.user}:
											{
												selectedDatabase.credentials
													.password
											}
											@{selectedDatabase.credentials.host}
											:{selectedDatabase.credentials.port}
											/
											{
												selectedDatabase.credentials
													.database
											}
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
