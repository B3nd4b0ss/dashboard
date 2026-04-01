/**
 * Creates a structured HTTP error that can be serialized consistently.
 *
 * @param {number} statusCode - HTTP status code that should be returned.
 * @param {string} message - User-facing error message.
 * @param {{code?: string, details?: Array<object>}} [options={}] - Optional metadata included in the API response.
 * @returns {Error} Error instance carrying status metadata.
 */
function createHttpError(statusCode, message, options = {}) {
	const error = new Error(message);
	error.statusCode = statusCode;

	if (options.code) {
		error.code = options.code;
	}

	if (Array.isArray(options.details) && options.details.length > 0) {
		error.details = options.details;
	}

	return error;
}

/**
 * Builds a validation error with optional field-level issue metadata.
 *
 * @param {string} message - Validation summary message.
 * @param {Array<object>} [details=[]] - Field-level validation issues.
 * @returns {Error} Structured validation error.
 */
function createValidationError(
	message = 'Request validation failed',
	details = [],
) {
	return createHttpError(400, message, {
		code: 'validation_error',
		details,
	});
}

/**
 * Builds a not-found error.
 *
 * @param {string} message - User-facing error message.
 * @returns {Error} Structured not-found error.
 */
function createNotFoundError(message = 'Resource not found') {
	return createHttpError(404, message, {
		code: 'not_found',
	});
}

/**
 * Builds a conflict error.
 *
 * @param {string} message - User-facing error message.
 * @returns {Error} Structured conflict error.
 */
function createConflictError(message) {
	return createHttpError(409, message, {
		code: 'conflict',
	});
}

module.exports = {
	createConflictError,
	createHttpError,
	createNotFoundError,
	createValidationError,
};
