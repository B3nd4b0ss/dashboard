const { getDatabaseById } = require('./databaseService');
const { getProjectRuntimeSnapshot } = require('./runtimeRegistry');
const {
	createProjectMonitoringSnapshot,
} = require('./projectMonitoringService');
const { getProjectTaskSummary } = require('./taskService');
const {
	getProjectCommandPresets,
	getPrimaryProjectCommandPresetId,
} = require('./projectTemplates');
const { getProjectLocation, getProjectPath } = require('../utils/projectPaths');

/**
 * Enriches a stored project record with runtime, monitoring, task, and command metadata.
 *
 * @param {object} project - Persisted project record.
 * @param {Map<string, object> | null} [taskSummaryMap=null] - Optional precomputed task summaries keyed by project name.
 * @param {object | null} [runtimeSnapshot=null] - Optional precomputed runtime snapshot.
 * @param {Map<string, object> | null} [monitoringMap=null] - Optional monitoring snapshots keyed by project name.
 * @returns {object} Decorated project payload returned by the API.
 */
function decorateProject(
	project,
	taskSummaryMap = null,
	runtimeSnapshot = null,
	monitoringMap = null,
) {
	const result = { ...project };

	if (project.databaseId) {
		const database = getDatabaseById(project.databaseId);
		if (database) {
			result.database = database;
		}
	}

	const runtime = runtimeSnapshot || getProjectRuntimeSnapshot(project);
	result.runtime = runtime;
	result.status = runtime.status;
	result.frontendUrl = runtime.services.frontend?.url || null;
	result.backendUrl = runtime.services.backend?.url || null;
	result.projectPath = getProjectPath(project);
	result.projectLocation = getProjectLocation(project);
	result.monitoring =
		monitoringMap?.get(project.name.toLowerCase()) ||
		createProjectMonitoringSnapshot(project, runtime);
	result.taskSummary =
		taskSummaryMap?.get(project.name.toLowerCase()) ||
		getProjectTaskSummary(project.name);
	result.commandPresets = getProjectCommandPresets(project);
	result.primaryCommandPresetId = getPrimaryProjectCommandPresetId(project);
	result.hasManagedServices = runtime.expectedServiceCount > 0;

	return result;
}

module.exports = {
	decorateProject,
};
