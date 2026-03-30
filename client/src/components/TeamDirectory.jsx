import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded';
import PendingActionsRounded from '@mui/icons-material/PendingActionsRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import PersonAddAltRounded from '@mui/icons-material/PersonAddAltRounded';
import { API_BASE_URL } from '../config/api';
import './TeamDirectory.css';

const API = API_BASE_URL;
const EMPTY_MEMBER_FORM = {
	name: '',
	role: '',
	email: '',
	accent: 'blue',
};

const ACCENT_OPTIONS = ['blue', 'green', 'amber', 'slate'];

/**
 * Builds a compact initials avatar label from a member name.
 *
 * @param {string} name - Full member name.
 * @returns {string} Initials used in the avatar chip.
 */
function getInitials(name) {
	return name
		.split(' ')
		.map((part) => part[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();
}

/**
 * Renders the team member directory with assignment summaries.
 *
 * @returns {JSX.Element} Team directory page.
 */
function TeamDirectory() {
	const [members, setMembers] = useState([]);
	const [tasks, setTasks] = useState([]);
	const [query, setQuery] = useState('');
	const [showEditor, setShowEditor] = useState(false);
	const [editingMember, setEditingMember] = useState(null);
	const [memberForm, setMemberForm] = useState(EMPTY_MEMBER_FORM);
	const [pageError, setPageError] = useState('');
	const [savingMember, setSavingMember] = useState(false);
	const [busyAction, setBusyAction] = useState('');

	const loadDirectory = async () => {
		const [membersResponse, tasksResponse] = await Promise.all([
			axios.get(`${API}/members`),
			axios.get(`${API}/tasks`),
		]);
		setMembers(membersResponse.data);
		setTasks(tasksResponse.data);
	};

	const refreshDirectory = async () => {
		try {
			await loadDirectory();
			setPageError('');
		} catch (error) {
			setPageError(
				error.response?.data?.error ||
					'Unable to load team data right now.',
			);
		}
	};

	useEffect(() => {
		refreshDirectory();
	}, []);

	const resetMemberForm = () => {
		setMemberForm(EMPTY_MEMBER_FORM);
		setEditingMember(null);
	};

	const openCreateMember = () => {
		resetMemberForm();
		setShowEditor(true);
	};

	const openEditMember = (member) => {
		setEditingMember(member);
		setMemberForm({
			name: member.name || '',
			role: member.role || '',
			email: member.email || '',
			accent: member.accent || 'blue',
		});
		setShowEditor(true);
	};

	const closeEditor = () => {
		setShowEditor(false);
		resetMemberForm();
	};

	const saveMember = async () => {
		if (!memberForm.name.trim()) {
			alert('Member name required.');
			return;
		}

		setSavingMember(true);

		try {
			if (editingMember) {
				await axios.patch(
					`${API}/members/${editingMember.id}`,
					memberForm,
				);
			} else {
				await axios.post(`${API}/members`, memberForm);
			}

			await refreshDirectory();
			closeEditor();
		} catch (error) {
			alert(error.response?.data?.error || 'Failed to save member.');
		} finally {
			setSavingMember(false);
		}
	};

	const deleteMember = async (member) => {
		if (
			!window.confirm(
				`Delete ${member.name}? Assigned tasks will become unassigned.`,
			)
		) {
			return;
		}

		setBusyAction(`delete:${member.id}`);

		try {
			await axios.delete(`${API}/members/${member.id}`);
			await refreshDirectory();
		} catch (error) {
			alert(error.response?.data?.error || 'Failed to delete member.');
		} finally {
			setBusyAction('');
		}
	};

	const visibleMembers = members.filter((member) =>
		[
			member.name,
			member.role,
			member.email,
			...(member.taskSummary?.projects || []),
		]
			.filter(Boolean)
			.join(' ')
			.toLowerCase()
			.includes(query.trim().toLowerCase()),
	);

	const activeAssignments = tasks.filter(
		(task) => task.status !== 'done',
	).length;
	const unassignedTasks = tasks.filter((task) => !task.assigneeId).length;
	const coveredProjects = [
		...new Set(
			members.flatMap((member) => member.taskSummary?.projects || []),
		),
	].length;

	return (
		<div className='team-page'>
			<section className='team-hero'>
				<div>
					<span className='section-tag'>Team Directory</span>
					<h2>
						Manage contributors and see where current project work
						is actually landing.
					</h2>
					<p>
						Assignments are now connected to tasks, so every member
						card shows real workload and project coverage instead of
						placeholders.
					</p>
				</div>
				<div className='team-hero-actions'>
					<button
						type='button'
						className='secondary-action'
						onClick={refreshDirectory}>
						<RefreshRounded fontSize='small' />
						Refresh
					</button>
					<button
						type='button'
						className='primary-action'
						onClick={openCreateMember}>
						<PersonAddAltRounded fontSize='small' />
						New member
					</button>
				</div>
			</section>

			<section className='team-metrics'>
				<article className='team-metric-card'>
					<div className='team-metric-icon blue'>
						<GroupsRounded />
					</div>
					<div>
						<span>Total members</span>
						<strong>{members.length}</strong>
					</div>
				</article>
				<article className='team-metric-card'>
					<div className='team-metric-icon green'>
						<TaskAltRounded />
					</div>
					<div>
						<span>Active assignments</span>
						<strong>{activeAssignments}</strong>
					</div>
				</article>
				<article className='team-metric-card'>
					<div className='team-metric-icon amber'>
						<PendingActionsRounded />
					</div>
					<div>
						<span>Unassigned tasks</span>
						<strong>{unassignedTasks}</strong>
					</div>
				</article>
				<article className='team-metric-card'>
					<div className='team-metric-icon slate'>
						<FolderRounded />
					</div>
					<div>
						<span>Projects covered</span>
						<strong>{coveredProjects}</strong>
					</div>
				</article>
			</section>

			{pageError && <div className='panel-error'>{pageError}</div>}

			<section className='team-toolbar'>
				<label className='board-search'>
					<SearchRounded fontSize='small' />
					<input
						className='search-input'
						placeholder='Search members, roles, emails, or linked projects'
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</label>
				<Link to='/tasks' className='ghost-link'>
					<ArrowOutwardRounded fontSize='small' />
					Open tasks
				</Link>
			</section>

			{showEditor && (
				<section className='member-editor'>
					<div className='panel-header panel-header-spread'>
						<div>
							<span className='section-tag muted'>
								Member Editor
							</span>
							<h3>
								{editingMember
									? 'Edit member'
									: 'Add a team member'}
							</h3>
							<p>
								Keep a lightweight directory of owners for
								project and task management.
							</p>
						</div>
					</div>

					<div className='member-form-grid'>
						<label className='field-group'>
							<span>Name</span>
							<input
								value={memberForm.name}
								onChange={(event) =>
									setMemberForm((previous) => ({
										...previous,
										name: event.target.value,
									}))
								}
							/>
						</label>
						<label className='field-group'>
							<span>Role</span>
							<input
								value={memberForm.role}
								onChange={(event) =>
									setMemberForm((previous) => ({
										...previous,
										role: event.target.value,
									}))
								}
								placeholder='Contributor'
							/>
						</label>
						<label className='field-group field-wide'>
							<span>Email</span>
							<input
								value={memberForm.email}
								onChange={(event) =>
									setMemberForm((previous) => ({
										...previous,
										email: event.target.value,
									}))
								}
								placeholder='name@example.com'
							/>
						</label>
						<label className='field-group field-wide'>
							<span>Accent</span>
							<div className='accent-picker'>
								{ACCENT_OPTIONS.map((accent) => (
									<button
										key={accent}
										type='button'
										className={`accent-option ${accent} ${
											memberForm.accent === accent
												? 'selected'
												: ''
										}`}
										onClick={() =>
											setMemberForm((previous) => ({
												...previous,
												accent,
											}))
										}>
										{accent}
									</button>
								))}
							</div>
						</label>
					</div>

					<div className='member-editor-actions'>
						<button
							type='button'
							className='ghost-button'
							onClick={closeEditor}>
							Cancel
						</button>
						<button
							type='button'
							className='primary-action'
							onClick={saveMember}
							disabled={savingMember}>
							{savingMember
								? 'Saving...'
								: editingMember
									? 'Save member'
									: 'Create member'}
						</button>
					</div>
				</section>
			)}

			<section className='member-grid-board'>
				{visibleMembers.length > 0 ? (
					visibleMembers.map((member) => (
						<article
							key={member.id}
							className='member-directory-card'>
							<div className='member-directory-head'>
								<div
									className={`member-avatar ${member.accent || 'blue'}`}>
									{getInitials(member.name)}
								</div>
								<div className='member-directory-copy'>
									<h3>{member.name}</h3>
									<p>{member.role || 'Contributor'}</p>
								</div>
							</div>

							{member.email && (
								<div className='member-contact-row'>
									<MailOutlineRounded fontSize='small' />
									<span>{member.email}</span>
								</div>
							)}

							<div className='member-stats-row'>
								<div>
									<span>Active</span>
									<strong>
										{member.taskSummary?.active || 0}
									</strong>
								</div>
								<div>
									<span>Done</span>
									<strong>
										{member.taskSummary?.completed || 0}
									</strong>
								</div>
								<div>
									<span>Total</span>
									<strong>
										{member.taskSummary?.total || 0}
									</strong>
								</div>
							</div>

							<div className='member-project-row'>
								{member.taskSummary?.projects?.length > 0 ? (
									member.taskSummary.projects.map(
										(projectName) => (
											<Link
												key={projectName}
												to={`/projects/${encodeURIComponent(projectName)}`}
												className='member-project-chip'>
												{projectName}
											</Link>
										),
									)
								) : (
									<span className='member-project-empty'>
										No project assignments yet
									</span>
								)}
							</div>

							<div className='member-directory-actions'>
								<button
									type='button'
									className='ghost-button'
									onClick={() => openEditMember(member)}>
									<EditRounded fontSize='small' />
									Edit
								</button>
								<button
									type='button'
									className='text-button'
									disabled={
										busyAction === `delete:${member.id}`
									}
									onClick={() => deleteMember(member)}>
									<DeleteOutlineRounded fontSize='small' />
									Delete
								</button>
							</div>
						</article>
					))
				) : (
					<div className='member-empty-state'>
						<div className='empty-board-icon'>
							<GroupsRounded />
						</div>
						<h3>No team members yet.</h3>
						<p>
							Add people here so tasks can be assigned and project
							workload is visible.
						</p>
						<button
							type='button'
							className='primary-action'
							onClick={openCreateMember}>
							<AddRounded fontSize='small' />
							Add first member
						</button>
					</div>
				)}
			</section>
		</div>
	);
}

export default TeamDirectory;
