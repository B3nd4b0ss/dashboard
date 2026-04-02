const PROJECT_CREATE_FIELDS = [
	'name',
	'frontend',
	'backend',
	'databaseId',
	'frontendPort',
	'backendPort',
	'projectLocation',
	'autoCreateRepo',
	'visibility',
	'description',
	'version',
	'javaPackageName',
	'javaMainClass',
	'javaVersion',
	'javaGroupId',
	'javaArtifactId',
];

/**
 * Builds the API payload for project creation while stripping UI-only composer fields.
 *
 * @param {object} form - Full composer form state from the overview page.
 * @param {{autoCreateRepo: boolean, visibility: 'public' | 'private'}} repository - Repository defaults resolved for the request.
 * @returns {object} Payload accepted by the project-create API.
 */
export function buildProjectCreatePayload(form, repository) {
	const payload = {};

	for (const field of PROJECT_CREATE_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(form, field)) {
			payload[field] = form[field];
		}
	}

	payload.autoCreateRepo = repository.autoCreateRepo;
	payload.visibility = repository.visibility;

	return payload;
}

