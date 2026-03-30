import { useEffect, useState } from 'react';
import axios from 'axios';
import GitHubIcon from '@mui/icons-material/GitHub';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import KeyRounded from '@mui/icons-material/KeyRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import { API_BASE_URL } from '../config/api';
import SurfaceSelect from './SurfaceSelect';
import './SettingsPage.css';

const API = API_BASE_URL;
const DEFAULT_FORM = {
	autoCreateRepo: true,
	owner: '',
	visibility: 'private',
	token: '',
	allowManualCommands: false,
};
const VISIBILITY_OPTIONS = [
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

/**
 * Normalizes API settings into the editable form state used by the settings page.
 *
 * @param {object} [settings={}] - Public settings payload returned by the API.
 * @returns {{autoCreateRepo: boolean, owner: string, visibility: string, token: string}} Editable form state.
 */
function normalizeSettingsForm(settings = {}) {
	const githubSettings = settings.github || {};
	const terminalSettings = settings.terminal || {};

	return {
		autoCreateRepo:
			typeof githubSettings.autoCreateRepo === 'boolean'
				? githubSettings.autoCreateRepo
				: DEFAULT_FORM.autoCreateRepo,
		owner: githubSettings.owner || '',
		visibility:
			githubSettings.visibility === 'public' ? 'public' : 'private',
		token: '',
		allowManualCommands:
			typeof terminalSettings.allowManualCommands === 'boolean'
				? terminalSettings.allowManualCommands
				: DEFAULT_FORM.allowManualCommands,
	};
}

/**
 * Renders the workspace-wide settings page, including GitHub publishing defaults.
 *
 * @returns {JSX.Element} Settings page.
 */
function SettingsPage() {
	const [form, setForm] = useState(DEFAULT_FORM);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [status, setStatus] = useState('');
	const [hasSavedToken, setHasSavedToken] = useState(false);
	const [clearSavedToken, setClearSavedToken] = useState(false);

	const loadSettings = async () => {
		try {
			const response = await axios.get(`${API}/system/settings`);
			const githubSettings = response.data?.github || {};
			setForm(normalizeSettingsForm(response.data || {}));
			setHasSavedToken(Boolean(githubSettings.hasToken));
			setClearSavedToken(false);
			setError('');
		} catch (loadError) {
			setError(
				loadError.response?.data?.error ||
					'Unable to load settings right now.',
			);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadSettings();
	}, []);

	const updateForm = (field, value) => {
		setForm((previous) => ({ ...previous, [field]: value }));
		setStatus('');
	};

	const saveSettings = async () => {
		setSaving(true);
		setStatus('');

		try {
			const payload = {
				github: {
					autoCreateRepo: form.autoCreateRepo,
					owner: form.owner,
					visibility: form.visibility,
				},
				terminal: {
					allowManualCommands: form.allowManualCommands,
				},
			};

			if (form.token.trim()) {
				payload.github.token = form.token.trim();
			}

			if (clearSavedToken) {
				payload.github.clearToken = true;
			}

			const response = await axios.patch(
				`${API}/system/settings`,
				payload,
			);
			const githubSettings = response.data?.github || {};
			setForm(normalizeSettingsForm(response.data || {}));
			setHasSavedToken(Boolean(githubSettings.hasToken));
			setClearSavedToken(false);
			setError('');
			setStatus(
				'Settings saved. GitHub defaults and terminal permissions are updated for the whole dashboard.',
			);
		} catch (saveError) {
			setError(
				saveError.response?.data?.error ||
					'Unable to save settings right now.',
			);
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return <div className='settings-state'>Loading settings...</div>;
	}

	return (
		<div className='settings-page'>
			<section className='settings-hero'>
				<div className='settings-copy'>
					<div className='settings-icon'>
						<GitHubIcon />
					</div>
					<span className='section-tag'>Repository Defaults</span>
					<h2>Control how new projects publish to GitHub.</h2>
					<p>
						Every new project now gets a root README, a local git
						repository, and a first commit. Use this page to decide
						whether the dashboard should also wire up
						<code> origin</code> and push automatically to GitHub.
					</p>
				</div>

				<div className='settings-summary-card'>
					<div className='settings-summary-head'>
						<strong>Current behavior</strong>
						<CheckCircleRounded fontSize='small' />
					</div>
					<p>
						{form.autoCreateRepo
							? hasSavedToken
								? 'New projects will create a README, initialize git, set origin, make the first commit, and publish to GitHub.'
								: 'New projects will create a README, initialize git, and make the first commit locally. Add a GitHub token to enable origin setup and publishing.'
							: 'New projects will create a README, initialize git, and make the first commit locally without creating a GitHub repository.'}
					</p>
					<p>
						{form.allowManualCommands
							? 'Advanced terminal mode is enabled, so workspace users can run ad-hoc commands in addition to presets.'
							: 'Advanced terminal mode is off, so the workspace terminal only allows curated presets until you explicitly unlock manual commands.'}
					</p>
				</div>
			</section>

			{error && <div className='settings-alert error'>{error}</div>}
			{status && <div className='settings-alert success'>{status}</div>}

			<section className='settings-card'>
				<div className='settings-card-head'>
					<div>
						<span className='section-tag muted'>GitHub</span>
						<h3>Automatic repository publishing</h3>
						<p>
							The created repository name matches the generated
							project slug. Leave the owner blank to publish into
							the GitHub account behind the saved token.
						</p>
					</div>
				</div>

				<div className='settings-grid'>
					<label className='settings-toggle-card'>
						<div>
							<strong>Auto-create GitHub repos</strong>
							<p>
								When enabled, the dashboard creates the remote
								repository, adds it as <code>origin</code>, and
								pushes the first commit after project
								scaffolding finishes.
							</p>
						</div>
						<input
							type='checkbox'
							checked={form.autoCreateRepo}
							onChange={(event) =>
								updateForm(
									'autoCreateRepo',
									event.target.checked,
								)
							}
						/>
					</label>

					<label className='settings-toggle-card'>
						<div>
							<strong>Enable advanced terminal commands</strong>
							<p>
								When disabled, the project workspace can still
								run saved presets, but ad-hoc shell commands
								stay locked. Turn this on only when you want the
								editor terminal to accept free-form commands.
							</p>
						</div>
						<input
							type='checkbox'
							checked={form.allowManualCommands}
							onChange={(event) =>
								updateForm(
									'allowManualCommands',
									event.target.checked,
								)
							}
						/>
					</label>

					<label className='field-group'>
						<span>GitHub owner or org</span>
						<input
							value={form.owner}
							onChange={(event) =>
								updateForm('owner', event.target.value)
							}
							placeholder='Leave blank to use the token owner'
						/>
					</label>

					<label className='field-group'>
						<span>Default visibility</span>
						<SurfaceSelect
							value={form.visibility}
							onChange={(nextValue) =>
								updateForm('visibility', nextValue)
							}
							options={VISIBILITY_OPTIONS}
						/>
					</label>

					<label className='field-group field-group-wide'>
						<div className='field-label-row'>
							<span>GitHub personal access token</span>
							<span className='settings-token-state'>
								<KeyRounded fontSize='inherit' />
								{hasSavedToken && !clearSavedToken
									? 'Saved token available'
									: 'No saved token'}
							</span>
						</div>
						<input
							type='password'
							value={form.token}
							onChange={(event) =>
								updateForm('token', event.target.value)
							}
							placeholder={
								hasSavedToken && !clearSavedToken
									? 'Leave blank to keep the current token'
									: 'Paste a token with repo permissions'
							}
							autoComplete='off'
						/>
						<div className='settings-token-actions'>
							<label className='settings-inline-check'>
								<input
									type='checkbox'
									checked={clearSavedToken}
									onChange={(event) =>
										setClearSavedToken(event.target.checked)
									}
								/>
								<span>
									Clear the saved token on the next save
								</span>
							</label>
							<p>
								The token is stored locally on this machine in
								the dashboard settings file so new projects can
								publish without prompting you each time.
							</p>
						</div>
					</label>
				</div>

				<div className='settings-actions'>
					<button
						type='button'
						className='ghost-button'
						onClick={loadSettings}
						disabled={saving}>
						Reset
					</button>
					<button
						type='button'
						className='primary-action'
						onClick={saveSettings}
						disabled={saving}>
						<SaveRounded fontSize='small' />
						{saving ? 'Saving...' : 'Save settings'}
					</button>
				</div>
			</section>
		</div>
	);
}

export default SettingsPage;
