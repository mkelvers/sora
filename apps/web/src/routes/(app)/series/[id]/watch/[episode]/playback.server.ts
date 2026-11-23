import { route, SoraError } from "@sora/sdk";
import type { PlaybackMedia, SoraClient } from "@sora/sdk";
import { attempt } from "@sora/shared";

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
		| { status: "temporary" }
		| { status: "failed" }
	);

/**
 * Resolves fresh streams or a display-safe failure. The catalog supplies
 * episode links when playback can't return its own.
 */
export const resolveEpisode = async (
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
		TypeError,
	);

	if (playback.error) {
		const { data: episodes } = await attempt(
			sora.request(route.listEpisodes, { params: { series_id: seriesId } }),
		);

		const links = {
			next: episodes?.find((candidate) => candidate.number > episode)?.number ?? null,
			previous: episodes?.findLast((candidate) => candidate.number < episode)?.number ?? null,
		};

		if (!(playback.error instanceof SoraError)) {
			return {
				...links,
				status: "temporary",
			};
		}

		const { code, status } = playback.error;
		const missing = status === 404 && (code === "EPISODE_NOT_FOUND" || code === "SERIES_NOT_FOUND");

		if (missing) {
			return {
				...links,
				status: "unavailable",
			};
		}

		const temporary = status === 429 || (status >= 500 && status < 600);

		if (temporary) {
			return {
				...links,
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
					url: `/api/stream/${new URL(source.url).pathname.split("/").pop()}`,
				})),
				subtitles: media.subtitles.map((track) => ({
					...track,
					url: `/api/stream/${new URL(track.url).pathname.split("/").pop()}`,
				})),
			}),
		),
		status: "ready",
	};
};
