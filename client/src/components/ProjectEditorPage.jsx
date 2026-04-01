import { Link, useParams } from 'react-router-dom';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import ProjectWorkspace from './ProjectWorkspace';
import './ProjectEditorPage.css';

/**
 * Renders the standalone full-page project editor route.
 *
 * @returns {JSX.Element} Project editor page.
 */
function ProjectEditorPage() {
	const { name } = useParams();
	const projectName = name || '';

	return (
		<div className='project-editor-page'>
			<div className='project-editor-nav'>
				<Link
					to={`/projects/${encodeURIComponent(projectName)}`}
					className='project-editor-back-link'
				>
					<ArrowBackRounded fontSize='small' />
					Back to project
				</Link>
				<Link
					to='/projects'
					className='project-editor-back-link subtle'
				>
					<ArrowOutwardRounded fontSize='small' />
					All projects
				</Link>
			</div>

			<section className='project-editor-hero'>
				<div>
					<span className='section-tag'>Workspace Editor</span>
					<h2>{projectName}</h2>
					<p>
						Open, edit, create, and delete project files, then run
						build or app commands from the built-in terminal without
						leaving the dashboard.
					</p>
				</div>
			</section>

			<ProjectWorkspace projectName={projectName} standalone />
		</div>
	);
}

export default ProjectEditorPage;
