import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardHome from './components/DashboardHome';
import Overview from './components/Overview';
import ProjectDetail from './components/ProjectDetail';
import ProjectEditorPage from './components/ProjectEditorPage';
import Databases from './components/Databases';
import DockerHub from './components/DockerHub';
import DockerStackDetail from './components/DockerStackDetail';
import TasksBoard from './components/TasksBoard';
import TaskDetailPage from './components/TaskDetailPage';
import SettingsPage from './components/SettingsPage';
import './App.css';

/**
 * Registers the top-level application routes.
 *
 * @returns {JSX.Element} Root router configuration.
 */
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
					<Route
						path='composer'
						element={<Overview mode='composer' />}
					/>
					<Route path='projects/:name' element={<ProjectDetail />} />
					<Route
						path='projects/:name/editor'
						element={<ProjectEditorPage />}
					/>
					<Route path='databases' element={<Databases />} />
					<Route path='docker' element={<DockerHub />} />
					<Route
						path='docker/:stackId'
						element={<DockerStackDetail />}
					/>
					<Route path='tasks' element={<TasksBoard />} />
					<Route path='tasks/:id' element={<TaskDetailPage />} />
					<Route
						path='team'
						element={<Navigate to='/dashboard' replace />}
					/>
					<Route path='settings' element={<SettingsPage />} />
				</Route>
			</Routes>
		</BrowserRouter>
	);
}

export default App;
