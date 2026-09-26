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
	const pad = (value: number) => String(value).padStart(2, '0');

	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const rest = pad(Math.floor(seconds % 60));

	if (hours > 0) {
		return `${hours}:${pad(minutes)}:${rest}`;
	}

	return `${minutes}:${rest}`;
}
