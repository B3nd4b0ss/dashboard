import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Overview from './components/Overview';
import ProjectDetail from './components/ProjectDetail';
import Databases from './components/Databases';
import Placeholder from './components/Placeholder';
import './App.css';

function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path='/' element={<Layout />}>
					{/* Overview (projects list) */}
					<Route index element={<Overview />} />
					{/* Project detail */}
					<Route path='projects/:name' element={<ProjectDetail />} />
					{/* Databases section */}
					<Route path='databases' element={<Databases />} />
					{/* Settings (placeholder) */}
					<Route
						path='settings'
						element={<Placeholder title='Settings' />}
					/>
					{/* Docker (placeholder) */}
					<Route
						path='docker'
						element={<Placeholder title='Docker' />}
					/>
				</Route>
			</Routes>
		</BrowserRouter>
	);
}

export default App;
