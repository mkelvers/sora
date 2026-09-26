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

export type AnimeSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

const animeSeasons: AnimeSeason[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

/** The broadcast season `offset` seasons from the one `date` falls in. */
export function animeSeason(date: Date, offset = 0) {
	const index = Math.floor(date.getMonth() / 3) + offset;
	return {
		season: animeSeasons[((index % 4) + 4) % 4],
		year: date.getFullYear() + Math.floor(index / 4)
	};
}

export function formatAnimeSeason(season: AnimeSeason, year: number) {
	return `${season[0]}${season.slice(1).toLowerCase()} ${year}`;
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
