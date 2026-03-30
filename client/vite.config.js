import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import dashboardConfig from '../dashboard.config.json';

// https://vite.dev/config/
export default defineConfig({
	server: {
		port: Number(dashboardConfig?.ports?.frontend) || 5173,
		strictPort: true,
	},
	plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
});
