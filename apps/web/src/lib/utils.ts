import type { SeriesCard } from "@sora/sdk";
import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import type { Attachment } from "svelte/attachments";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => {
	return twMerge(clsx(inputs));
};

export const audioLabel = (audio: SeriesCard["audio"] | null | undefined) => {
	const sub = !!audio?.includes("sub");
	const dub = !!audio?.includes("dub");

	if (sub && dub) {
		return "Sub | Dub";
	}

	return sub ? "Subtitled" : dub ? "Dubbed" : "";
};

export const episodes = (count: number) => {
	return `${count} ${count === 1 ? "Episode" : "Episodes"}`;
};

export const pollWhileVisible = (refresh: () => void, intervalMs = 30_000) => {
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
};

export const onVisible = (callback: () => void, rootMargin: string): Attachment => {
	return (node) => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					callback();
				}
			},
			{
				rootMargin,
			},
		);

		observer.observe(node);
		return () => observer.disconnect();
	};
};

const tmdbBucket = /^(https:\/\/image\.tmdb\.org\/t\/p\/)[^/]+\//;

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

export const tmdbImage = (url: string, size: TmdbSize) => {
	return url.replace(tmdbBucket, `$1${size}/`);
};

export const tmdbSrcset = (url: string, sizes: Partial<Record<TmdbSize, number>>) => {
	if (!tmdbBucket.test(url)) {
		return;
	}

	return Object.entries(sizes)
		.map(([size, width]) => `${tmdbImage(url, size as TmdbSize)} ${width}w`)
		.join(", ");
};

const menuKeys: Record<string, (index: number, count: number) => number> = {
	ArrowDown: (index, count) => (index + 1) % count,
	ArrowUp: (index, count) => (index - 1 + count) % count,
	End: (_, count) => count - 1,
	Home: () => 0,
};

export const moveMenuFocus = (event: KeyboardEvent & { currentTarget: HTMLElement }) => {
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
};
