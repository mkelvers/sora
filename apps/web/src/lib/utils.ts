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

export function safeRedirect(url: URL) {
	const target = url.searchParams.get('redirect');
	return target?.startsWith('/') && !target.startsWith('//') ? target : '/';
}

export function avatarSeeds(count: number) {
	return Array.from({ length: count }, () => crypto.randomUUID().slice(0, 8));
}

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
