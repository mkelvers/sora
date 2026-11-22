import type { SeriesCard } from "@sora/sdk";
import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import type { Attachment } from "svelte/attachments";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const audioLabel = (audio: SeriesCard["audio"] | null | undefined) => {
	const sub = !!audio?.includes("sub");
	const dub = !!audio?.includes("dub");

	if (sub && dub) {
		return "Sub | Dub";
	}

	if (sub) {
		return "Subtitled";
	}

	if (dub) {
		return "Dubbed";
	}

	return "";
};

export const episodes = (count: number) => `${count} ${count === 1 ? "Episode" : "Episodes"}`;

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

export const onVisible =
	(reveal: () => void, rootMargin: string): Attachment =>
	(node) => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					reveal();
				}
			},
			{
				rootMargin,
			},
		);

		observer.observe(node);

		return () => observer.disconnect();
	};

const tmdbBucket = /^(?<prefix>https:\/\/image\.tmdb\.org\/t\/p\/)[^/]+\//u;

const SizeSchema = z.enum([
	"w45",
	"w92",
	"w154",
	"w185",
	"w300",
	"w342",
	"w500",
	"w780",
	"w1280",
	"original",
]);

export type TmdbSize = z.infer<typeof SizeSchema>;

export const tmdbImage = (url: string, size: TmdbSize) => url.replace(tmdbBucket, `$1${size}/`);

export const tmdbSrcset = (url: string, sizes: Partial<Record<TmdbSize, number>>) => {
	if (!tmdbBucket.test(url)) {
		return;
	}

	return Object.entries(sizes)
		.map(([size, width]) => `${tmdbImage(url, SizeSchema.parse(size))} ${width}w`)
		.join(", ");
};

const menuKeys = new Map<string, (index: number, count: number) => number>(
	Object.entries({
		ArrowDown: (index, count) => (index + 1) % count,
		ArrowUp: (index, count) => (index - 1 + count) % count,
		End: (_, count) => count - 1,
		Home: () => 0,
	}),
);

export const moveMenuFocus = (event: KeyboardEvent & { currentTarget: HTMLElement }) => {
	const step = menuKeys.get(event.key);

	const items = [
		...event.currentTarget.querySelectorAll<HTMLElement>(
			"a[href], button:not(:disabled), input:not(:disabled)",
		),
	].filter((item) => item.checkVisibility());

	if (!step || !items.length) {
		return;
	}

	event.preventDefault();
	const active = document.activeElement;
	let index = -1;

	if (active instanceof HTMLElement) {
		index = items.indexOf(active);
	}

	items[step(index, items.length)]?.focus();
};
