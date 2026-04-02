const { z } = require('zod');
const {
	BACKEND_TEMPLATE_DEFINITIONS,
	FRONTEND_TEMPLATE_DEFINITIONS,
	getBackendTemplateDefinition,
	getFrontendTemplateDefinition,
	templateRequiresPort,
} = require('../services/projectTemplates');
const {
	optionalEnumString,
	optionalPortInput,
	optionalPositiveIntQuery,
	optionalTrimmedString,
	requiredTrimmedString,
} = require('./common');

const frontendTemplateIds = Object.keys(FRONTEND_TEMPLATE_DEFINITIONS);
const backendTemplateIds = Object.keys(BACKEND_TEMPLATE_DEFINITIONS);
const projectNameParamsSchema = z.object({
	name: requiredTrimmedString('Project name', 120),
});
const projectExecutionParamsSchema = projectNameParamsSchema.extend({
	executionId: requiredTrimmedString('Execution id', 120),
});
const projectPresetParamsSchema = projectNameParamsSchema.extend({
	presetId: requiredTrimmedString('Preset id', 120),
});

const projectCreateBodySchema = z
	.object({
		name: requiredTrimmedString('Project name', 120),
		frontend: optionalEnumString(frontendTemplateIds, 'Frontend template', {
			allowEmpty: true,
			nullable: true,
		}),
		backend: optionalEnumString(backendTemplateIds, 'Backend template', {
			allowEmpty: true,
			nullable: true,
		}),
		databaseId: z
			.union([z.string().trim().max(120), z.literal(''), z.null()])
			.optional(),
		frontendPort: optionalPortInput('Frontend port'),
		backendPort: optionalPortInput('Backend port'),
		projectLocation: optionalTrimmedString('Project location', 500),
		autoCreateRepo: z.boolean().optional(),
		visibility: z.enum(['public', 'private']).optional(),
		description: optionalTrimmedString('Description', 500),
		version: optionalTrimmedString('Version', 40),
		javaPackageName: optionalTrimmedString('Java package name', 200),
		javaMainClass: optionalTrimmedString('Java main class', 120),
		javaVersion: optionalTrimmedString('Java version', 40),
		javaGroupId: optionalTrimmedString('Java group id', 200),
		javaArtifactId: optionalTrimmedString('Java artifact id', 120),
	})
	.strict()
	.superRefine((data, ctx) => {
		const frontendDefinition = data.frontend
			? getFrontendTemplateDefinition(data.frontend)
			: null;
		const backendDefinition = data.backend
			? getBackendTemplateDefinition(data.backend)
			: null;
		const frontendNeedsPort = templateRequiresPort(frontendDefinition);
		const backendNeedsPort = templateRequiresPort(backendDefinition);

		if (frontendNeedsPort && !data.frontendPort) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['frontendPort'],
				message: 'Frontend port is required for the selected template',
			});
		}

		if (backendNeedsPort && !data.backendPort) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['backendPort'],
				message: 'Backend port is required for the selected template',
			});
		}

		if (
			frontendNeedsPort &&
			backendNeedsPort &&
			data.frontendPort &&
			data.backendPort &&
			String(data.frontendPort).trim() === String(data.backendPort).trim()
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['backendPort'],
				message: 'Frontend and backend ports must be different',
			});
		}
	});

const projectUpdateBodySchema = z
	.object({
		name: optionalTrimmedString('Project name', 120),
		frontendPort: optionalPortInput('Frontend port'),
		backendPort: optionalPortInput('Backend port'),
		databaseId: z
			.union([z.string().trim().max(120), z.literal(''), z.null()])
			.optional(),
		projectLocation: optionalTrimmedString('Project location', 500),
		description: optionalTrimmedString('Description', 500),
		version: optionalTrimmedString('Version', 40),
		javaPackageName: optionalTrimmedString('Java package name', 200),
		javaMainClass: optionalTrimmedString('Java main class', 120),
		javaVersion: optionalTrimmedString('Java version', 40),
		javaGroupId: optionalTrimmedString('Java group id', 200),
		javaArtifactId: optionalTrimmedString('Java artifact id', 120),
	})
	.strict()
	.refine((payload) => Object.keys(payload).length > 0, {
		message: 'At least one project field must be provided',
		path: ['body'],
	});

const projectLogsQuerySchema = z.object({
	service: optionalEnumString(['frontend', 'backend'], 'Log service'),
	limit: optionalPositiveIntQuery('Log limit', 1000),
});

const projectFilePathQuerySchema = z.object({
	path: requiredTrimmedString('Path', 500),
});

const projectEntryBodySchema = z
	.object({
		path: requiredTrimmedString('Path', 500),
		type: optionalEnumString(['file', 'directory'], 'Entry type'),
	})
	.strict();

const projectFileSaveBodySchema = z
	.object({
		path: requiredTrimmedString('Path', 500),
		content: z
			.string({
				required_error: 'File content is required',
				invalid_type_error: 'File content must be a string',
			})
			.refine(
				(value) => Buffer.byteLength(value, 'utf8') <= 1024 * 1024,
				'File content must be 1 MB or smaller',
			),
	})
	.strict();

const projectCommandBodySchema = z
	.object({
		command: requiredTrimmedString('Command', 2000),
		cwd: optionalTrimmedString('Working directory', 500),
		label: optionalTrimmedString('Command label', 120),
	})
	.strict();

const projectHistoryQuerySchema = z.object({
	limit: optionalPositiveIntQuery('History limit', 20),
});

const projectDeleteQuerySchema = z.object({
	deleteRemote: z
		.union([
			z.literal('true'),
			z.literal('false'),
			z.literal(true),
			z.literal(false),
		])
		.optional()
		.transform((value) => value === 'true' || value === true),
});

module.exports = {
	projectCommandBodySchema,
	projectCreateBodySchema,
	projectDeleteQuerySchema,
	projectEntryBodySchema,
	projectExecutionParamsSchema,
	projectFilePathQuerySchema,
	projectFileSaveBodySchema,
	projectHistoryQuerySchema,
	projectLogsQuerySchema,
	projectNameParamsSchema,
	projectPresetParamsSchema,
	projectUpdateBodySchema,
};
