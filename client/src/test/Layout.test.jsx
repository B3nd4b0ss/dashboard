import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import Layout from '../components/Layout';

function SearchEcho() {
	const location = useLocation();

	return <div data-testid='search-value'>{location.search}</div>;
}

test('Layout renders route metadata and keeps the shared topbar search param in sync', async () => {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		json: async () => [],
	});
	vi.stubGlobal('fetch', fetchMock);

	render(
		<MemoryRouter initialEntries={['/tasks?q=backend']}>
			<Routes>
				<Route path='/' element={<Layout />}>
					<Route path='tasks' element={<SearchEcho />} />
				</Route>
			</Routes>
		</MemoryRouter>,
	);

	expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
	expect(
		screen.getByText(
			'Track your personal workload with statuses, priorities, and due dates.',
		),
	).toBeInTheDocument();

	const searchInput = screen.getByRole('searchbox', {
		name: 'Search tasks, statuses, or due dates',
	});
	expect(searchInput).toHaveValue('backend');
	expect(screen.getByTestId('search-value')).toHaveTextContent('?q=backend');

	fireEvent.change(searchInput, { target: { value: 'release' } });
	expect(screen.getByTestId('search-value')).toHaveTextContent('?q=release');

	await waitFor(() => {
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:4000/projects',
		);
	});
});
