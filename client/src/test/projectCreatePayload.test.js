import { expect, test } from 'vitest';
import { buildProjectCreatePayload } from '../utils/projectCreatePayload';

test('buildProjectCreatePayload keeps only API-supported fields', () => {
	const payload = buildProjectCreatePayload(
		{
			name: 'Alpha',
			projectLocation: 'projects',
			frontendFamily: 'vite',
			frontendPreset: 'vite-react',
			frontend: 'vite-react',
			backendRuntime: 'node',
			backendPreset: 'node',
			backend: 'node',
			databaseId: 'db-1',
			frontendPort: '3000',
			backendPort: '4000',
			description: 'Alpha workspace',
			version: '0.1.0',
			javaPackageName: 'com.example.alpha',
			javaMainClass: 'App',
			javaVersion: '21',
			javaGroupId: 'com.example',
			javaArtifactId: 'alpha',
			autoCreateRepo: null,
			visibility: '',
		},
		{
			autoCreateRepo: true,
			visibility: 'private',
		},
	);

	expect(payload).toEqual({
		name: 'Alpha',
		frontend: 'vite-react',
		backend: 'node',
		databaseId: 'db-1',
		frontendPort: '3000',
		backendPort: '4000',
		projectLocation: 'projects',
		autoCreateRepo: true,
		visibility: 'private',
		description: 'Alpha workspace',
		version: '0.1.0',
		javaPackageName: 'com.example.alpha',
		javaMainClass: 'App',
		javaVersion: '21',
		javaGroupId: 'com.example',
		javaArtifactId: 'alpha',
	});
});
