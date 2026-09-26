const languages = new Intl.DisplayNames(['en'], {
	type: 'language'
});

export function formatLanguage(code: string | null) {
	return code ? (languages.of(code) ?? code) : 'Textless';
}

export function formatSeason(number: number) {
	return number === 0 ? 'Specials' : `Season ${number}`;
}

export function formatTime(date: Date) {
	return date.toLocaleTimeString('da-DK', {
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function formatDate(date: string) {
	return new Date(date).toLocaleDateString('da-DK', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

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

export function formatDay(date: Date) {
	return date.toLocaleDateString('da-DK', {
		day: 'numeric',
		month: 'long'
	});
}

/** Formats a `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` date only as precisely as it is known. */
export function formatFuzzyDate(date: string) {
	const parts = date.split('-').length;

	if (parts === 1) {
		return date;
	}

	return new Date(date).toLocaleDateString('da-DK', {
		day: parts === 3 ? 'numeric' : undefined,
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

const tmdbBucket = /^(https:\/\/image\.tmdb\.org\/t\/p\/)[^/]+\//;

/**
 * Points a TMDB image at one of TMDB's size buckets, such as `w300`, instead
 * of whichever it was stored with. Other URLs, such as AniList's, are left as is.
 */
export function tmdbImage(url: string, size: string) {
	return url.replace(tmdbBucket, `$1${size}/`);
}

/** A `srcset` of TMDB size buckets, keyed by their width in pixels; `undefined` for other URLs. */
export function tmdbSrcset(url: string, sizes: Record<string, number>) {
	if (!tmdbBucket.test(url)) {
		return undefined;
	}

	return Object.entries(sizes)
		.map(([size, width]) => `${tmdbImage(url, size)} ${width}w`)
		.join(', ');
}

/** A `redirect` query parameter as a path on this site, never another origin; `/` otherwise. */
export function safeRedirect(url: URL) {
	const target = url.searchParams.get('redirect');
	return target?.startsWith('/') && !target.startsWith('//') ? target : '/';
}

/** Fresh DiceBear seeds, to offer as avatars. */
export function avatarSeeds(count: number) {
	return Array.from({ length: count }, () => crypto.randomUUID().slice(0, 8));
}

/** The profiles page, still headed for `redirect` once a profile is chosen, and optionally managing. */
export function profilesPath(redirect: string, manage = false) {
	const params = new URLSearchParams();
	if (manage) {
		params.set('manage', '1');
	}
	if (redirect !== '/') {
		params.set('redirect', redirect);
	}
	const query = params.toString();
	return query ? `/profiles?${query}` : '/profiles';
}
