import type { SeriesCard } from "@sora/sdk";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function audioLabel(audio: SeriesCard["audio"] | null | undefined) {
	const sub = !!audio?.includes("sub");
	const dub = !!audio?.includes("dub");

	if (sub && dub) {
		return "Sub | Dub";
	}

	return sub ? "Subtitled" : dub ? "Dubbed" : "";
}

export function pollWhileVisible(refresh: () => void, intervalMs = 30_000) {
	const check = () => {
		if (document.visibilityState === "visible") {
			refresh();
		}
	};
	const timer = setInterval(check, intervalMs);
	document.addEventListener("visibilitychange", check);

	return () => {
		clearInterval(timer);
		document.removeEventListener("visibilitychange", check);
	};
}

const tmdbBucket = /^(https:\/\/image\.tmdb\.org\/t\/p\/)[^/]+\//;

/** Every width TMDB serves, across its poster, backdrop, logo and still sizes. */
export type TmdbSize =
	| "w45"
	| "w92"
	| "w154"
	| "w185"
	| "w300"
	| "w342"
	| "w500"
	| "w780"
	| "w1280"
	| "original";

export function tmdbImage(url: string, size: TmdbSize) {
	return url.replace(tmdbBucket, `$1${size}/`);
}

export function tmdbSrcset(url: string, sizes: Partial<Record<TmdbSize, number>>) {
	if (!tmdbBucket.test(url)) {
		return undefined;
	}

	return Object.entries(sizes)
		.map(([size, width]) => `${tmdbImage(url, size as TmdbSize)} ${width}w`)
		.join(", ");
}

const menuKeys: Record<string, (index: number, count: number) => number> = {
	ArrowDown: (index, count) => (index + 1) % count,
	ArrowUp: (index, count) => (index - 1 + count) % count,
	Home: () => 0,
	End: (_, count) => count - 1,
};

export function moveMenuFocus(event: KeyboardEvent & { currentTarget: HTMLElement }) {
	const step = menuKeys[event.key];
	const items = [
		...event.currentTarget.querySelectorAll<HTMLElement>(
			"a[href], button:not(:disabled), input:not(:disabled)",
		),
	].filter((item) => item.checkVisibility());
	if (!step || !items.length) {
		return;
	}

	event.preventDefault();
	const index = items.indexOf(document.activeElement as HTMLElement);
	items[step(index, items.length)]?.focus();
}
