import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './ProjectDetail.css';

const API = 'http://localhost:4000';

function ProjectDetail() {
	const { name } = useParams();
	const navigate = useNavigate();
	const [project, setProject] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [editMode, setEditMode] = useState(false);
	const [edited, setEdited] = useState({});
	const [showConnectionModal, setShowConnectionModal] = useState(false);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		fetchProject();
	}, [name]);

	const fetchProject = async () => {
		try {
			const res = await axios.get(
				`${API}/projects/${encodeURIComponent(name)}`,
			);
			setProject(res.data);
			setEdited(res.data);
			setLoading(false);
		} catch (err) {
			setError('Project not found');
			setLoading(false);
		}
	};

	const handleChange = (field, value) => {
		setEdited((prev) => ({ ...prev, [field]: value }));
	};

	const saveChanges = async () => {
		try {
			const updates = {};
			if (edited.name !== project.name) updates.name = edited.name;
			if (edited.frontendPort !== project.frontendPort)
				updates.frontendPort = edited.frontendPort;
			if (edited.backendPort !== project.backendPort)
				updates.backendPort = edited.backendPort;
			if (edited.databaseId !== project.databaseId)
				updates.databaseId = edited.databaseId;
			await axios.patch(
				`${API}/projects/${encodeURIComponent(project.name)}`,
				updates,
			);
			if (updates.name && updates.name !== project.name) {
				navigate(`/projects/${encodeURIComponent(updates.name)}`);
			} else {
				fetchProject();
			}
			setEditMode(false);
		} catch (err) {
			alert(err.response?.data?.error || 'Update failed');
		}
	};

	const showConnectionString = () => {
		setShowConnectionModal(true);
	};

	const copyToClipboard = async () => {
		if (!project.database || !project.database.credentials) return;
		const { user, password, database, port, host } =
			project.database.credentials;
		const conn = `postgresql://${user}:${password}@${host}:${port}/${database}`;

		try {
			await navigator.clipboard.writeText(conn);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			alert('Failed to copy to clipboard');
		}
	};

	if (loading) return <div className='detail-loading'>Loading...</div>;
	if (error) return <div className='detail-error'>{error}</div>;

	return (
		<div className='project-detail'>
			{/* Connection String Modal */}
			{showConnectionModal &&
				project.database &&
				project.database.credentials && (
					<div
						className='modal-overlay'
						onClick={() => setShowConnectionModal(false)}>
						<div
							className='modal-content'
							onClick={(e) => e.stopPropagation()}>
							<div className='modal-header'>
								<h3>Database Connection String</h3>
								<button
									className='modal-close'
									onClick={() =>
										setShowConnectionModal(false)
									}>
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
												{
													project.database.credentials
														.user
												}
												:********@
												{
													project.database.credentials
														.host
												}
												:
												{
													project.database.credentials
														.port
												}
												/
												{
													project.database.credentials
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
												{
													project.database.credentials
														.user
												}
												:
												{
													project.database.credentials
														.password
												}
												@
												{
													project.database.credentials
														.host
												}
												:
												{
													project.database.credentials
														.port
												}
												/
												{
													project.database.credentials
														.database
												}
											</code>
										</div>
									</div>
									<div className='connection-actions'>
										<button
											className='copy-btn'
											onClick={copyToClipboard}>
											{copied
												? '✓ Copied!'
												: '📋 Copy Full String'}
										</button>
									</div>
									<div className='connection-note'>
										<small>
											⚠️ Keep this password secret! It
											grants full access to your database.
										</small>
									</div>
								</div>
							</div>
						</div>
					</div>
				)}

			<div className='detail-header'>
				<h2>{project.name}</h2>
				{!editMode ? (
					<button
						className='edit-btn'
						onClick={() => setEditMode(true)}>
						Edit
					</button>
				) : (
					<div className='edit-actions'>
						<button className='save-btn' onClick={saveChanges}>
							Save
						</button>
						<button
							className='cancel-btn'
							onClick={() => setEditMode(false)}>
							Cancel
						</button>
					</div>
				)}
			</div>

			{!editMode ? (
				<div className='detail-info'>
					<div className='info-row'>
						<span className='info-label'>Frontend:</span>
						<span className='info-value'>
							{project.frontend || 'None'}
						</span>
					</div>
					<div className='info-row'>
						<span className='info-label'>Backend:</span>
						<span className='info-value'>
							{project.backend || 'None'}
						</span>
					</div>
					<div className='info-row'>
						<span className='info-label'>Database:</span>
						<span className='info-value'>
							{project.database ? project.database.name : 'None'}
						</span>
					</div>
					{project.frontend && (
						<div className='info-row'>
							<span className='info-label'>Frontend Port:</span>
							<span className='info-value'>
								{project.frontendPort}
							</span>
						</div>
					)}
					{project.backend && (
						<div className='info-row'>
							<span className='info-label'>Backend Port:</span>
							<span className='info-value'>
								{project.backendPort}
							</span>
						</div>
					)}
					<div className='info-row'>
						<span className='info-label'>Status:</span>
						<span className={`status ${project.status}`}>
							{project.status}
						</span>
					</div>

					{project.database && project.database.credentials && (
						<div className='database-credentials'>
							<h3>Database Credentials</h3>
							<div className='info-row'>
								<span className='info-label'>Type:</span>
								<span className='info-value'>
									{project.database.type}
								</span>
							</div>
							<div className='info-row'>
								<span className='info-label'>User:</span>
								<span className='info-value'>
									{project.database.credentials.user}
								</span>
							</div>
							<div className='info-row'>
								<span className='info-label'>Password:</span>
								<span className='info-value'>••••••••</span>
							</div>
							<div className='info-row'>
								<span className='info-label'>Database:</span>
								<span className='info-value'>
									{project.database.credentials.database}
								</span>
							</div>
							<div className='info-row'>
								<span className='info-label'>Port:</span>
								<span className='info-value'>
									{project.database.credentials.port}
								</span>
							</div>
							<div className='info-row'>
								<span className='info-label'>Host:</span>
								<span className='info-value'>
									{project.database.credentials.host}
								</span>
							</div>
							{project.database.clientPort && (
								<div className='info-row'>
									<span className='info-label'>Adminer:</span>
									<span className='info-value'>
										<a
											href={`http://localhost:${project.database.clientPort}`}
											target='_blank'
											rel='noopener noreferrer'>
											Open Adminer (port{' '}
											{project.database.clientPort})
										</a>
									</span>
								</div>
							)}
							<button
								onClick={showConnectionString}
								className='connection-btn'>
								🔗 Show Connection String
							</button>
						</div>
					)}
				</div>
			) : (
				<div className='detail-edit'>
					<div className='edit-row'>
						<label>Name:</label>
						<input
							value={edited.name}
							onChange={(e) =>
								handleChange('name', e.target.value)
							}
						/>
					</div>
					{project.frontend && (
						<div className='edit-row'>
							<label>Frontend Port:</label>
							<input
								type='number'
								value={edited.frontendPort}
								onChange={(e) =>
									handleChange('frontendPort', e.target.value)
								}
							/>
						</div>
					)}
					{project.backend && (
						<div className='edit-row'>
							<label>Backend Port:</label>
							<input
								type='number'
								value={edited.backendPort}
								onChange={(e) =>
									handleChange('backendPort', e.target.value)
								}
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export default ProjectDetail;
