import SurfaceSelect from './SurfaceSelect';
import {
	PRIORITY_OPTIONS,
	TASK_STATUS_OPTIONS,
	TASK_TYPE_OPTIONS,
	buildBranchPreview,
	buildTaskKeyPreview,
} from '../utils/taskPresentation';

/**
 * Renders the reusable task create/edit modal.
 *
 * @param {{open: boolean, mode?: string, title?: string, form: object, members?: object[], projects?: object[], tasks?: object[], editingTask?: object | null, onClose: () => void, onChange: (nextForm: object) => void, onSubmit: (event: React.FormEvent) => void, saving?: boolean, error?: string}} props - Component props.
 * @returns {JSX.Element | null} Modal content when open.
 */
function TaskEditorModal({
	open,
	onClose,
	onSave,
	taskForm,
	setTaskForm,
	editingTask,
	projects,
	tasks,
	savingTask,
}) {
	if (!open) {
		return null;
	}

	const projectOptions = [
		{
			value: '',
			label: 'General',
			description: 'Task is not linked to one project.',
		},
		...projects.map((project) => ({
			value: project.name,
			label: project.name,
			description: `${project.taskSummary?.total || 0} tracked tasks`,
		})),
	];

	const ticketKeyPreview = buildTaskKeyPreview(
		tasks,
		taskForm.projectName,
		editingTask,
	);
	const branchPreview = buildBranchPreview(
		taskForm.type,
		ticketKeyPreview,
		taskForm.title,
		editingTask?.branch?.name || '',
	);

	return (
		<div className='task-modal-overlay' onClick={onClose}>
			<div
				className='task-modal-card'
				onClick={(event) => event.stopPropagation()}>
				<div className='task-modal-header'>
					<div>
						<span className='section-tag muted'>Ticket Editor</span>
						<h3>{editingTask ? 'Edit ticket' : 'Create ticket'}</h3>
						<p>
							Keep the ticket details here, then use the detail
							page for the full context and workflow actions.
						</p>
					</div>
					<button
						type='button'
						className='ghost-button'
						onClick={onClose}>
						Close
					</button>
				</div>

				<div className='task-ticket-preview-grid'>
					<div className='task-ticket-preview-card'>
						<span>Ticket key</span>
						<strong>
							{editingTask?.ticketKey || ticketKeyPreview}
						</strong>
						<p>
							{taskForm.projectName
								? 'Uses the linked project name as the ticket prefix.'
								: 'General tickets stay unlinked until you attach them to a project.'}
						</p>
					</div>
					<div className='task-ticket-preview-card'>
						<span>Branch preview</span>
						<strong>{branchPreview}</strong>
						<p>
							{taskForm.projectName
								? 'Creating a branch from this ticket will use this path automatically.'
								: 'Link a project if you want the dashboard to create a real Git branch for this ticket.'}
						</p>
					</div>
				</div>

				<div className='task-form-grid'>
					<label className='field-group field-wide'>
						<span>Title</span>
						<input
							value={taskForm.title}
							onChange={(event) =>
								setTaskForm((previous) => ({
									...previous,
									title: event.target.value,
								}))
							}
							placeholder='Summarize the work in one clear line'
						/>
					</label>

					<label className='field-group field-wide'>
						<span>Description</span>
						<textarea
							value={taskForm.description}
							onChange={(event) =>
								setTaskForm((previous) => ({
									...previous,
									description: event.target.value,
								}))
							}
							rows={7}
							placeholder='Add context, expected behavior, acceptance notes, or implementation details.'
						/>
					</label>

					<label className='field-group'>
						<span>Project</span>
						<SurfaceSelect
							value={taskForm.projectName}
							onChange={(nextValue) =>
								setTaskForm((previous) => ({
									...previous,
									projectName: nextValue,
								}))
							}
							options={projectOptions}
						/>
					</label>

					<label className='field-group'>
						<span>Type</span>
						<SurfaceSelect
							value={taskForm.type}
							onChange={(nextValue) =>
								setTaskForm((previous) => ({
									...previous,
									type: nextValue,
								}))
							}
							options={TASK_TYPE_OPTIONS}
						/>
					</label>

					<label className='field-group'>
						<span>Status</span>
						<SurfaceSelect
							value={taskForm.status}
							onChange={(nextValue) =>
								setTaskForm((previous) => ({
									...previous,
									status: nextValue,
								}))
							}
							options={TASK_STATUS_OPTIONS}
						/>
					</label>

					<label className='field-group'>
						<span>Priority</span>
						<SurfaceSelect
							value={taskForm.priority}
							onChange={(nextValue) =>
								setTaskForm((previous) => ({
									...previous,
									priority: nextValue,
								}))
							}
							options={PRIORITY_OPTIONS}
						/>
					</label>

					<label className='field-group'>
						<span>Due date</span>
						<input
							type='date'
							value={taskForm.dueDate}
							onChange={(event) =>
								setTaskForm((previous) => ({
									...previous,
									dueDate: event.target.value,
								}))
							}
						/>
					</label>
				</div>

				<div className='task-modal-actions'>
					<button
						type='button'
						className='ghost-button'
						onClick={onClose}>
						Cancel
					</button>
					<button
						type='button'
						className='primary-action'
						onClick={onSave}
						disabled={savingTask}>
						{savingTask
							? 'Saving...'
							: editingTask
								? 'Save ticket'
								: 'Create ticket'}
					</button>
				</div>
			</div>
		</div>
	);
}

export default TaskEditorModal;
