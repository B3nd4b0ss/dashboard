import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import axios from 'axios';
import DashboardHome from '../components/DashboardHomeme';

vi.mock('axios', () => ({
	default: {
		get: vi.fn(),
	},
}));

test('DashboardHome filters projects, tasks, and databases by the shared search query', async () => {
	axios.get.mockImplementation((url) => {
		if (url.endsWith('/projects')) {
			return Promise.resolve({
				data: [
					{
						name: 'Alpha Project',
						status: 'running',
						taskSummary: {
							total: 3,
							completed: 1,
							progressPercentage: 33,
						},
						runtime: {
							activeServiceCount: 2,
							expectedServiceCount: 2,
						},
						database: {
							name: 'Alpha DB',
						},
					},
					{
						name: 'Beta Project',
						status: 'stopped',
						taskSummary: {
							total: 2,
							completed: 2,
							progressPercentage: 100,
						},
						runtime: {
							activeServiceCount: 0,
							expectedServiceCount: 1,
						},
						database: {
							name: 'Beta DB',
						},
					},
				],
			});
		}

		if (url.endsWith('/tasks')) {
			return Promise.resolve({
				data: [
					{
						id: 'task-1',
						title: 'Alpha launch checklist',
						projectName: 'Alpha Project',
						priority: 'high',
						status: 'backlog',
						dueDate: '2026-04-15',
						overdue: false,
					},
					{
						id: 'task-2',
						title: 'Beta release',
						projectName: 'Beta Project',
						priority: 'low',
						status: 'done',
						dueDate: '2026-04-20',
						overdue: false,
					},
				],
			});
		}

		if (url.endsWith('/databases')) {
			return Promise.resolve({
				data: [
					{
						id: 'db-1',
						name: 'Alpha DB',
						type: 'postgres',
						port: 5432,
						clientPort: 8080,
					},
					{
						id: 'db-2',
						name: 'Beta Warehouse',
						type: 'mysql',
						port: 3306,
						clientPort: null,
					},
				],
			});
		}

		return Promise.reject(new Error(`Unexpected request: ${url}`));
	});

	render(
		<MemoryRouter initialEntries={['/dashboard?q=alpha']}>
			<DashboardHome />
		</MemoryRouter>,
	);

	expect(await screen.findByText('Alpha Project')).toBeInTheDocument();
	expect(screen.queryByText('Beta Project')).not.toBeInTheDocument();
	expect(screen.getByText('1 open tasks')).toBeInTheDocument();
	expect(screen.getByText('1 tracked databases')).toBeInTheDocument();
	expect(screen.getByText('Alpha launch checklist')).toBeInTheDocument();
	expect(screen.queryByText('Beta release')).not.toBeInTheDocument();
});

test('DashboardHome surfaces backend load failures', async () => {
	axios.get.mockRejectedValue({
		response: {
			data: {
				error: 'Dashboard load failed',
			},
		},
	});

	render(
		<MemoryRouter initialEntries={['/dashboard']}>
			<DashboardHome />
		</MemoryRouter>,
	);

	expect(
		await screen.findByText('Dashboard load failed'),
	).toBeInTheDocument();
});
