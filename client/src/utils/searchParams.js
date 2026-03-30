/**
 * Reads a search-param value while normalizing missing values to an empty string.
 *
 * @param {URLSearchParams} searchParams - Search params object from React Router.
 * @param {string} key - Search param key to read.
 * @returns {string} Param value or an empty string when the key is missing.
 */
export function getSearchParamValue(searchParams, key) {
	return searchParams.get(key) ?? '';
}

/**
 * Builds a new `URLSearchParams` object with selected keys added, changed, or removed.
 *
 * @param {URLSearchParams} searchParams - Existing search params object.
 * @param {Record<string, string | number | null | undefined>} updates - Keys to add, update, or delete.
 * @returns {URLSearchParams} New search params object containing the requested changes.
 */
export function buildNextSearchParams(searchParams, updates) {
	const nextSearchParams = new URLSearchParams(searchParams);

	Object.entries(updates).forEach(([key, value]) => {
		if (value === null || value === undefined) {
			nextSearchParams.delete(key);
			return;
		}

		nextSearchParams.set(key, String(value));
	});

	return nextSearchParams;
}

/**
 * Updates a text search param, removing it entirely when the value is blank.
 *
 * @param {URLSearchParams} searchParams - Existing search params object.
 * @param {string} key - Search param key to update.
 * @param {unknown} value - Text-like value to store.
 * @returns {URLSearchParams} New search params object with the normalized text value.
 */
export function buildNextTextSearchParams(searchParams, key, value) {
	const normalizedValue =
		typeof value === 'string' ? value : String(value ?? '');

	return buildNextSearchParams(searchParams, {
		[key]: normalizedValue.trim() ? normalizedValue : null,
	});
}
