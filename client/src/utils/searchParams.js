export function getSearchParamValue(searchParams, key) {
	return searchParams.get(key) ?? '';
}

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

export function buildNextTextSearchParams(searchParams, key, value) {
	const normalizedValue =
		typeof value === 'string' ? value : String(value ?? '');

	return buildNextSearchParams(searchParams, {
		[key]: normalizedValue.trim() ? normalizedValue : null,
	});
}
