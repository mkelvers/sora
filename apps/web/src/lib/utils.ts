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

export function formatEpisode(season: { kind: string; number: number; title: string } | undefined, episode: number) {
	if (!season || season.kind === 'season') {
		return season ? `S${season.number} E${episode}` : `E${episode}`;
	}
	return season.kind === 'movie' ? season.title : `${season.title} E${episode}`;
}

export function formatScore(score: number) {
	return (score / 10).toFixed(1);
}

export function formatMinutes(minutes: number) {
	const hours = Math.floor(minutes / 60);
	const rest = Math.round(minutes % 60);
	return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

/** "Today", "Tomorrow", or the weekday, for dates in the coming week. */
export function formatDay(date: Date) {
	const today = new Date();
	const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

	if (date.toDateString() === today.toDateString()) {
		return 'Today';
	}
	if (date.toDateString() === tomorrow.toDateString()) {
		return 'Tomorrow';
	}

	return date.toLocaleDateString('en-GB', {
		weekday: 'long'
	});
}
