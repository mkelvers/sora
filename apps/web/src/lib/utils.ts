export const languages = new Intl.DisplayNames(['en'], {
	type: 'language'
});

export function formatClock(seconds: number) {
	if (!Number.isFinite(seconds)) {
		seconds = 0;
	}

	const pad = (value: number) => String(value).padStart(2, '0');

	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const rest = pad(Math.floor(seconds % 60));

	if (hours > 0) {
		return `${hours}:${pad(minutes)}:${rest}`;
	}

	return `${minutes}:${rest}`;
}

const tmdbBucket = /^(https:\/\/image\.tmdb\.org\/t\/p\/)[^/]+\//;

export function tmdbImage(url: string, size: string) {
	return url.replace(tmdbBucket, `$1${size}/`);
}

export function tmdbSrcset(url: string, sizes: Record<string, number>) {
	if (!tmdbBucket.test(url)) {
		return undefined;
	}

	return Object.entries(sizes)
		.map(([size, width]) => `${tmdbImage(url, size)} ${width}w`)
		.join(', ');
}
