/**
 * Sends a successful JSON response while keeping the payload shape compatible with the existing frontend.
 *
 * @param {import('express').Response} res - Express response object.
 * @param {unknown} data - JSON payload to return.
 * @param {number} [statusCode=200] - HTTP status code for the response.
 * @returns {import('express').Response} Express response object.
 */
function sendData(res, data, statusCode = 200) {
	return res.status(statusCode).json(data);
}

/**
 * Sends a message-only JSON response.
 *
 * @param {import('express').Response} res - Express response object.
 * @param {string} message - User-facing response message.
 * @param {number} [statusCode=200] - HTTP status code for the response.
 * @returns {import('express').Response} Express response object.
 */
function sendMessage(res, message, statusCode = 200) {
	return res.status(statusCode).json({ message });
}

/**
 * Serializes an error into the dashboard API error shape.
 *
 * @param {import('express').Response} res - Express response object.
 * @param {Error & {statusCode?: number, details?: Array<object>, code?: string}} error - Error to serialize.
 * @param {number} [fallbackStatusCode=500] - Status used when the error does not already define one.
 * @returns {import('express').Response} Express response object.
 */
function sendErrorResponse(res, error, fallbackStatusCode = 500) {
	const statusCode = error?.statusCode || fallbackStatusCode;
	const payload = {
		error:
			statusCode >= 500
				? 'Internal server error'
				: error?.message || 'Request failed',
	};

	if (error?.code) {
		payload.code = error.code;
	}

	if (Array.isArray(error?.details) && error.details.length > 0) {
		payload.details = error.details;
	}

	return res.status(statusCode).json(payload);
}

/**
 * Sends a validation error response.
 *
 * @param {import('express').Response} res - Express response object.
 * @param {Error & {details?: Array<object>}} error - Validation error to serialize.
 * @returns {import('express').Response} Express response object.
 */
function sendValidationError(res, error) {
	return sendErrorResponse(res, error, 400);
}

/**
 * Sends a not-found error response.
 *
 * @param {import('express').Response} res - Express response object.
 * @param {string} [message='Resource not found'] - User-facing message.
 * @returns {import('express').Response} Express response object.
 */
function sendNotFound(res, message = 'Resource not found') {
	return res.status(404).json({
		error: message,
		code: 'not_found',
	});
}

/**
 * Sends an internal-server-error response.
 *
 * @param {import('express').Response} res - Express response object.
 * @param {Error} [error] - Optional error object used for status metadata.
 * @returns {import('express').Response} Express response object.
 */
function sendInternalError(res, error) {
	return sendErrorResponse(res, error || new Error('Internal server error'));
}

/**
 * Wraps an async Express route and forwards rejections to the error middleware.
 *
 * @param {Function} handler - Async route handler.
 * @returns {Function} Express-compatible route handler.
 */
function asyncHandler(handler) {
	return function wrappedAsyncHandler(req, res, next) {
		Promise.resolve(handler(req, res, next)).catch(next);
	};
}

module.exports = {
	asyncHandler,
	sendData,
	sendErrorResponse,
	sendInternalError,
	sendMessage,
	sendNotFound,
	sendValidationError,
};
