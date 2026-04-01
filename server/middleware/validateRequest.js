const { ZodError } = require('zod');
const { createValidationError } = require('../utils/httpErrors');

/**
 * Converts a Zod validation error into field-level API details.
 *
 * @param {ZodError} error - Zod validation error instance.
 * @returns {Array<{path: string, message: string, code: string}>} Field-level validation issues.
 */
function formatValidationIssues(error) {
	return error.issues.map((issue) => ({
		path: issue.path.length > 0 ? issue.path.join('.') : 'request',
		message: issue.message,
		code: issue.code,
	}));
}

/**
 * Validates selected request segments before they reach the route handler.
 *
 * @param {{params?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, body?: import('zod').ZodTypeAny}} schemas - Zod schemas for request segments.
 * @returns {import('express').RequestHandler} Express middleware.
 */
function validateRequest(schemas) {
	return function requestValidationMiddleware(req, res, next) {
		try {
			if (schemas.params) {
				req.params = schemas.params.parse(req.params);
			}

			if (schemas.query) {
				req.query = schemas.query.parse(req.query);
			}

			if (schemas.body) {
				req.body = schemas.body.parse(req.body);
			}

			next();
		} catch (error) {
			if (error instanceof ZodError) {
				next(
					createValidationError(
						'Request validation failed',
						formatValidationIssues(error),
					),
				);
				return;
			}

			next(error);
		}
	};
}

module.exports = {
	validateRequest,
};
