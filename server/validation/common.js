const { z } = require('zod');

/**
 * Builds a required trimmed string schema with a readable field label.
 *
 * @param {string} label - Field label used in validation messages.
 * @param {number} [maxLength=160] - Maximum character length.
 * @returns {import('zod').ZodString} Zod string schema.
 */
function requiredTrimmedString(label, maxLength = 160) {
	return z
		.string({
			required_error: `${label} is required`,
			invalid_type_error: `${label} must be a string`,
		})
		.trim()
		.min(1, `${label} is required`)
		.max(maxLength, `${label} is too long`);
}

/**
 * Builds an optional trimmed string schema that preserves empty strings when the client intentionally clears a field.
 *
 * @param {string} label - Field label used in validation messages.
 * @param {number} [maxLength=2000] - Maximum character length.
 * @returns {import('zod').ZodOptional<import('zod').ZodString>} Zod string schema.
 */
function optionalTrimmedString(label, maxLength = 2000) {
	return z
		.string({
			invalid_type_error: `${label} must be a string`,
		})
		.trim()
		.max(maxLength, `${label} is too long`)
		.optional();
}

/**
 * Builds an optional string enum validator without changing the original value shape.
 *
 * @param {string[]} values - Allowed string values.
 * @param {string} label - Field label used in validation messages.
 * @param {{allowEmpty?: boolean, nullable?: boolean}} [options={}] - Enum options.
 * @returns {import('zod').ZodType<string | '' | null | undefined>} Zod schema for the enum-like field.
 */
function optionalEnumString(values, label, options = {}) {
	return z
		.union([
			z
				.string({
					invalid_type_error: `${label} must be a string`,
				})
				.trim()
				.refine((value) => values.includes(value), {
					message: `${label} must be one of: ${values.join(', ')}`,
				}),
			...(options.allowEmpty ? [z.literal('')] : []),
			...(options.nullable ? [z.null()] : []),
		])
		.optional();
}

/**
 * Builds an optional port input validator that accepts numeric strings, numbers, or empty values.
 *
 * @param {string} label - Field label used in validation messages.
 * @returns {import('zod').ZodType<string | number | '' | null | undefined>} Zod port schema.
 */
function optionalPortInput(label) {
	const errorMessage = `${label} must be a number between 1 and 65535`;

	return z
		.union([
			z
				.number({
					invalid_type_error: errorMessage,
				})
				.int(errorMessage)
				.min(1, errorMessage)
				.max(65535, errorMessage),
			z
				.string({
					invalid_type_error: errorMessage,
				})
				.trim()
				.regex(/^\d+$/, errorMessage)
				.refine((value) => {
					const parsed = Number.parseInt(value, 10);
					return parsed >= 1 && parsed <= 65535;
				}, errorMessage),
			z.literal(''),
			z.null(),
		])
		.optional();
}

/**
 * Builds a positive integer query schema that parses strings into numbers.
 *
 * @param {string} label - Field label used in validation messages.
 * @param {number} maxValue - Maximum accepted numeric value.
 * @returns {import('zod').ZodOptional<import('zod').ZodNumber>} Zod number schema.
 */
function optionalPositiveIntQuery(label, maxValue) {
	return z.preprocess(
		(value) => {
			if (
				typeof value === 'undefined' ||
				value === null ||
				value === ''
			) {
				return undefined;
			}

			if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
				return Number.parseInt(value.trim(), 10);
			}

			return value;
		},
		z
			.number({
				invalid_type_error: `${label} must be a positive integer`,
			})
			.int(`${label} must be a positive integer`)
			.positive(`${label} must be a positive integer`)
			.max(maxValue, `${label} must be ${maxValue} or smaller`)
			.optional(),
	);
}

module.exports = {
	optionalEnumString,
	optionalPortInput,
	optionalPositiveIntQuery,
	optionalTrimmedString,
	requiredTrimmedString,
};
