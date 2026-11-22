import { route, SoraError } from "@sora/sdk";
import type { PlaybackMedia, SoraClient } from "@sora/sdk";
import { attempt, second } from "@sora/shared";

export type WatchMedia = Omit<PlaybackMedia, "provider" | "locale" | "hardsub">;

interface EpisodeLinks {
	next: number | null;
	previous: number | null;
}

type WatchPlayback = EpisodeLinks &
	(
		| {
				status: "ready";
				media: WatchMedia[];
		  }
		| { status: "unavailable" }
		| {
				status: "temporary";
				retryAt: number | null;
		  }
		| { status: "failed" }
	);

const proxied = (url: string) => `/api/stream/${new URL(url).pathname.split("/").pop()}`;

/**
 * Resolves fresh streams or a display-safe failure. The catalog supplies
 * episode links when playback can't return its own.
 */
export const resolveWatchPlayback = async (
	sora: SoraClient,
	{
		seriesId,
		episode,
	}: {
		seriesId: string;
		episode: number;
	},
): Promise<WatchPlayback> => {
	const playback = await attempt(
		sora.requestWithMeta(route.getPlayback, {
			params: {
				episode,
				series_id: seriesId,
			},
		}),
		SoraError,
	);

	if (playback.error) {
		const { code, status, retryAfterSeconds } = playback.error;
		const retryAt = retryAfterSeconds === null ? null : Date.now() + retryAfterSeconds * second;

		const { data: episodes } = await attempt(
			sora.request(route.listEpisodes, { params: { series_id: seriesId } }),
		);

		const links = {
			next: episodes?.find((candidate) => candidate.number > episode)?.number ?? null,
			previous: episodes?.findLast((candidate) => candidate.number < episode)?.number ?? null,
		};

		if (status === 404 && (code === "EPISODE_NOT_FOUND" || code === "SERIES_NOT_FOUND")) {
			return {
				...links,
				status: "unavailable",
			};
		}

		if (status === 429 || (status >= 500 && status < 600)) {
			return {
				...links,
				retryAt: Number.isSafeInteger(retryAt) ? retryAt : null,
				status: "temporary",
			};
		}

		return {
			...links,
			status: "failed",
		};
	}

	const { results, meta } = playback.data;
	const links = {
		next: meta.next_episode,
		previous: meta.previous_episode,
	};
	const playable = results.filter((media) => media.sources.length > 0);

	if (playable.length === 0) {
		return {
			...links,
			status: "unavailable",
		};
	}

	return {
		...links,
		media: playable.map(
			({ provider: _provider, locale: _locale, hardsub: _hardsub, ...media }) => ({
				...media,
				sources: media.sources.map((source) => ({
					...source,
					url: proxied(source.url),
				})),
				subtitles: media.subtitles.map((track) => ({
					...track,
					url: proxied(track.url),
				})),
			}),
		),
		status: "ready",
	};
};
