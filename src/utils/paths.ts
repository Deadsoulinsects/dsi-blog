export const withBase = (base: string, path: string) => {
	const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;

	return `${trimmedBase}${normalizedPath}`;
};

export const toParamSlug = (value: string) =>
	value
		.trim()
		.toLowerCase()
		.replace(/\./g, '')
		.replace(/\s+/g, '-');
