import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { SeriesCard } from '@sora/sdk';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const languages = new Intl.DisplayNames(['en'], {
	type: 'language',
});

export function audioLabel(audio: SeriesCard['audio'] | null | undefined) {
	const sub = !!audio?.includes('sub');
	const dub = !!audio?.includes('dub');

	if (sub && dub) {
		return 'Sub | Dub';
	}

	return sub ? 'Subtitled' : dub ? 'Dubbed' : '';
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

const kinds: Partial<Record<SeriesCard['kind'], string>> = {
	tv: 'Series',
	movie: 'Movie',
};

const statuses: Partial<Record<NonNullable<SeriesCard['status']>, string>> = {
	RELEASING: 'Airing',
	NOT_YET_RELEASED: 'Upcoming',
};

export function describeCard(card: SeriesCard) {
	return [card.year, kinds[card.kind], card.status && statuses[card.status]]
		.filter((part) => !!part)
		.join(' · ');
}
