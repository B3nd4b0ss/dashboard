const { assertPortAvailable, normalizePort } = require('./portRegistry');
const {
	getBackendTemplateDefinition,
	getFrontendTemplateDefinition,
	templateRequiresPort,
} = require('./projectTemplates');

/**
 * Verifies that the selected project templates exist before scaffolding begins.
 *
 * @param {{frontend?: string | null, backend?: string | null}} templates - Template ids selected by the client.
 * @returns {void}
 */
function ensureSupportedProjectTemplates({ frontend, backend }) {
	getFrontendTemplateDefinition(frontend);
	getBackendTemplateDefinition(backend);
}

/**
 * Normalizes the frontend and backend ports required by a template selection.
 *
 * @param {{frontend?: string | null, backend?: string | null, frontendPort?: string | number | null, backendPort?: string | number | null}} options - Template and port inputs from the client.
 * @returns {{frontendPort: number | null, backendPort: number | null}} Normalized ports for the selected templates.
 */
function resolveProjectPorts({ frontend, backend, frontendPort, backendPort }) {
	const frontendDefinition = getFrontendTemplateDefinition(frontend);
	const backendDefinition = getBackendTemplateDefinition(backend);
	const resolvedFrontendPort = templateRequiresPort(frontendDefinition)
		? normalizePort(frontendPort, 'Frontend port')
		: null;
	const resolvedBackendPort = templateRequiresPort(backendDefinition)
		? normalizePort(backendPort, 'Backend port')
		: null;

	if (
		templateRequiresPort(frontendDefinition) &&
		templateRequiresPort(backendDefinition) &&
		resolvedFrontendPort === resolvedBackendPort
	) {
		throw new Error('Frontend and backend ports must be different');
	}

	return {
		frontendPort: resolvedFrontendPort,
		backendPort: resolvedBackendPort,
	};
}

/**
 * Validates project ports against current system usage and persisted assignments.
 *
 * @param {{frontend?: string | null, backend?: string | null, frontendPort?: string | number | null, backendPort?: string | number | null, excludeProjectName?: string | null, currentFrontendPort?: number | null, currentBackendPort?: number | null}} options - Template, port, and exclusion inputs.
 * @returns {{frontendPort: number | null, backendPort: number | null}} Validated ports for the selected templates.
 */
function validateProjectPorts({
	frontend,
	backend,
	frontendPort,
	backendPort,
	excludeProjectName = null,
	currentFrontendPort = null,
	currentBackendPort = null,
}) {
	const resolvedPorts = resolveProjectPorts({
		frontend,
		backend,
		frontendPort,
		backendPort,
	});

	if (
		resolvedPorts.frontendPort !== null &&
		resolvedPorts.frontendPort !== currentFrontendPort
	) {
		assertPortAvailable(resolvedPorts.frontendPort, {
			label: 'Frontend port',
			excludeProjectName,
		});
	}

	if (
		resolvedPorts.backendPort !== null &&
		resolvedPorts.backendPort !== currentBackendPort
	) {
		assertPortAvailable(resolvedPorts.backendPort, {
			label: 'Backend port',
			excludeProjectName,
		});
	}

	return resolvedPorts;
}

module.exports = {
	ensureSupportedProjectTemplates,
	resolveProjectPorts,
	validateProjectPorts,
};
