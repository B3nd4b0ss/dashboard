import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import Layout from './components/Layout';
import DashboardHome from './components/DashboardHome';
import Overview from './components/Overview';
import ProjectDetail from './components/ProjectDetail';
import Databases from './components/Databases';
import DockerHub from './components/DockerHub';
import DockerStackDetail from './components/DockerStackDetail';
import TasksBoard from './components/TasksBoard';
import Placeholder from './components/Placeholder';
import './App.css';

function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path='/' element={<Layout />}>
					<Route
						index
						element={<Navigate to='/dashboard' replace />}
					/>
					<Route path='dashboard' element={<DashboardHome />} />
					<Route path='projects' element={<Overview />} />
					<Route path='projects/:name' element={<ProjectDetail />} />
					<Route path='databases' element={<Databases />} />
					<Route path='docker' element={<DockerHub />} />
					<Route
						path='docker/:stackId'
						element={<DockerStackDetail />}
					/>
					<Route path='tasks' element={<TasksBoard />} />
					<Route
						path='team'
						element={<Navigate to='/dashboard' replace />}
					/>
					<Route
						path='settings'
						element={
							<Placeholder
								title='Workspace Settings'
								eyebrow='Control Surface'
								description='Global preferences, workspace defaults, notifications, and automation rules can live here next. The settings page is already styled with grouped rows and action states.'
								icon={SettingsRounded}
								preview='settings'
								highlights={[
									'Grouped controls are prepared for preferences and access rules.',
									'Form rows, toggles, and secondary actions already match the new shell.',
									'Good place for future theme, notifications, and workspace defaults.',
								]}
							/>
						}
					/>
				</Route>
			</Routes>
		</BrowserRouter>
	);
}

export default App;
