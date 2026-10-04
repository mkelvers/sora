import { attempt } from "@sora/shared";
import { z } from "zod";

import { getAnime } from "../../catalog/queries/anime";
import {
	EpisodeNotFoundError,
	InvalidInputError,
	PlaybackUnavailableError,
	type ProviderAttempt,
} from "../../errors";
import type { PlaybackMedia, PlaybackSubtitle, SkipSegment } from "../../models/playback";
import type { ContentLanguage } from "../../models/series";
import { locateEpisode } from "../../series/episodes";
import { getProviderUnits, type ProviderUnit } from "../episodes/episodes";
import { getEpisodeVersions, type EpisodeVersion } from "../episodes/versions";
import type { ProviderVideo, StreamProvider, StreamQuality } from "../providers/provider";
import { isServedSubtitle, servedLocale, streamProviders } from "../providers/registry";
import { canFetchStream, createStreamToken, segmentStarts, tokenLifetimeMs } from "../proxy/proxy";
import { mirrorsFor, StreamUpstreamError } from "../proxy/upstream";
import { alignTimelines, shiftTime, type TimelineShift } from "./align";
import type { SubtitleKind } from "./subtitle-kind";
import { subtitleKinds } from "./subtitle-kinds";

/** Everything a player needs to play an episode, in every version it has. */
export interface Playback {
	seriesId: string;
	/** The episode's number in the series, from 1. */
	episode: number;
	/** When the stream URLs stop working, as an ISO 8601 timestamp. */
	expiresAt: string;
	/**
	 * Every version a provider can stream right now: dub before sub before
	 * raw, so the first is the one to play by default.
	 */
	media: PlaybackMedia[];
}

export const PlaybackRequestSchema = z.object({
	seriesId: z.string().min(1),
	/** The episode's number in the series, from 1. */
	episode: z.number().int().positive(),
});

export type PlaybackRequest = z.input<typeof PlaybackRequestSchema>;

export interface PlaybackOptions {
	/**
	 * Absolute URL of the proxy route that serves stream tokens, such as
	 * `https://api.example/v1/streams`. Each URL in the playback is a token
	 * under it.
	 */
	streamBaseUrl: string;
}

/**
 * Asked of providers for every episode, whatever their stored episode lists
 * say. Those lists are snapshots, and a provider's list can leave out a dub
 * its player streams (AniKoto's API leaves out many), so they only decide
 * which provider is asked first.
 */
const alwaysTried: readonly EpisodeVersion[] = [
	{
		language: "dub",
		locale: servedLocale,
	},
	{
		language: "sub",
		locale: servedLocale,
	},
];

const qualityRank: Record<StreamQuality, number> = {
	auto: 0,
	"1080p": 1,
	"720p": 2,
	"480p": 3,
	"360p": 4,
};

/**
 * Resolves playable streams for one episode in every English version
 * providers offer it in, such as dub and sub, at once. Each version comes
 * from the first English provider that can stream it; a version none can
 * stream right now is left out. A sub keeps every subtitle track its
 * provider has, and always has English ones: a provider with English tracks
 * is preferred, and otherwise the first whose English subtitles are burned in
 * is served, marked `hardsub`.
 *
 * Each version carries the opening and ending its provider's player ships
 * with the stream, so they need no requests of their own.
 *
 * Upstream URLs are never exposed; clients receive proxy URLs so upstream
 * headers and hosts stay on the server. They expire with their tokens.
 *
 * @throws {@link InvalidInputError} when the request fails {@link PlaybackRequestSchema}.
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 * @throws {@link EpisodeNotFoundError} when the series has no such episode,
 *   or no provider lists it.
 * @throws {@link PlaybackUnavailableError} when providers list the episode but
 *   none can currently stream any version of it.
 */
export async function resolvePlayback(
	request: PlaybackRequest,
	options: PlaybackOptions,
): Promise<Playback> {
	const parsed = PlaybackRequestSchema.safeParse(request);
	if (!parsed.success) {
		throw new InvalidInputError("Invalid playback request", {
			cause: parsed.error,
		});
	}

	const { seriesId, episode } = parsed.data;
	// Taken before any token is made, so every token outlives it.
	const expiresAt = new Date(Date.now() + tokenLifetimeMs).toISOString();
	const located = await locateEpisode(seriesId, episode);
	const anime = await getAnime(located.anilistId);
	const offered = await getEpisodeVersions(located);
	const streamUrl = (token: string) =>
		`${options.streamBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(token)}`;

	// Versions share each provider's episode list.
	const lists = new Map<string, Promise<ProviderUnit[]>>();
	const unitsOf = (provider: StreamProvider) => {
		const list = lists.get(provider.id) ?? getProviderUnits(anime, provider);
		lists.set(provider.id, list);
		return list;
	};

	const served = offered.filter(
		(version) =>
			(version.locale === null || version.locale === servedLocale) &&
			!alwaysTried.some(
				(tried) => tried.language === version.language && tried.locale === version.locale,
			),
	);
	const results = await Promise.all(
		[...alwaysTried, ...served].map((version) =>
			resolveVersion(version, located.number, unitsOf, streamUrl),
		),
	);
	const sub = results.find((result) => result.version?.audio === "sub" && !result.version.hardsub);
	const dub = results.find((result) => result.version?.audio === "dub");
	if (sub?.version && sub.videos && dub?.version && dub.videos) {
		const shifts = await timelineShifts(sub.videos, dub.videos);
		dub.version.subtitles = await subtitlesForDub(sub.videos, dub.videos, streamUrl, shifts);
		dub.version.skip_segments = skipSegmentsForDub(
			sub.version.skip_segments,
			dub.version.skip_segments,
			shifts,
		);
	}

	const media = results.flatMap((result) => (result.version ? [result.version] : []));
	if (media.length > 0) {
		return {
			seriesId,
			episode,
			expiresAt,
			media,
		};
	}

	if (!results.some((result) => result.listed)) {
		throw new EpisodeNotFoundError(seriesId, episode);
	}

	throw new PlaybackUnavailableError(
		seriesId,
		episode,
		results.flatMap((result) => result.attempts),
	);
}

/**
 * Resolves one version of an AniList episode from the first provider that
 * serves its locale and can stream it: those whose episode list has the
 * version, in priority order, then those whose list leaves it out, since
 * lists can be stale or incomplete.
 */
async function resolveVersion(
	{ language, locale }: EpisodeVersion,
	anilistEpisode: number,
	unitsOf: (provider: StreamProvider) => Promise<ProviderUnit[]>,
	streamUrl: (token: string) => string,
): Promise<{
	version: PlaybackMedia | null;
	/** The upstream videos behind `version`. */
	videos?: ProviderVideo[];
	/** Whether a provider serving the locale lists the episode. */
	listed: boolean;
	attempts: ProviderAttempt[];
}> {
	const attempts: ProviderAttempt[] = [];
	const fail = (provider: StreamProvider, reason: string) =>
		attempts.push({
			provider: provider.id,
			reason: `${language}${locale ? ` (${locale})` : ""}: ${reason}`,
		});
	let hardsubbed = null as {
		version: PlaybackMedia;
		videos: ProviderVideo[];
	} | null;

	const candidates: {
		provider: StreamProvider;
		unit: ProviderUnit;
	}[] = [];
	for (const provider of streamProviders) {
		if (provider.locale !== servedLocale || (locale !== null && provider.locale !== locale)) {
			continue;
		}

		const units = await attempt(unitsOf(provider));
		if (units.error) {
			fail(provider, units.error.message);
			continue;
		}

		const unit = units.data.find((candidate) => candidate.number === anilistEpisode);
		if (unit) {
			candidates.push({
				provider,
				unit,
			});
		} else {
			fail(provider, "Episode not listed");
		}
	}

	const listed = candidates.length > 0;

	/** Resolves the version from one provider; `null`, with the reason recorded, when it cannot. */
	const resolveWith = async (provider: StreamProvider, unit: ProviderUnit) => {
		const resolved = await attempt(provider.resolveStream(unit.id, language));
		if (resolved.error) {
			fail(provider, resolved.error.message);
			return null;
		}
		const stream = resolved.data;

		const [loads, kinds] =
			language === "sub"
				? await Promise.all([englishSubtitlesLoad(stream.videos), subtitleKinds(stream.videos)])
				: [true, new Map<string, SubtitleKind | null>()];
		if (!loads) {
			fail(provider, "English subtitles cannot be fetched");
			return null;
		}

		const media = toPlaybackMedia(stream.videos, streamUrl, kinds);
		const version = {
			audio: language,
			label: audioLabels[language],
			locale,
			provider: provider.id,
			hardsub: language === "sub" && !media.subtitles.some(isServedSubtitle),
			sources: media.sources,
			// Providers hand a dub the sub's subtitles timed to the sub's encode;
			// resolvePlayback retimes them to the dub's once both are resolved.
			subtitles: language === "sub" ? withDefault(media.subtitles) : [],
			skip_segments: stream.skipSegments,
		};

		// A sub without English tracks has them burned in. Later providers may
		// serve tracks, which players can style and turn off, so they are tried
		// first, and this one is kept to fall back on.
		if (version.hardsub) {
			fail(provider, "Subtitles are burned in");
			hardsubbed ??= {
				version,
				videos: stream.videos,
			};
			return null;
		}

		return {
			version,
			videos: stream.videos,
		};
	};

	// Providers whose list has the version are asked in turn, so a later one
	// is asked only when an earlier one fails.
	const lists = ({ unit }: (typeof candidates)[number]) =>
		!unit.languages || unit.languages.includes(language);
	for (const { provider, unit } of candidates.filter(lists)) {
		const found = await resolveWith(provider, unit);
		if (found) {
			return {
				...found,
				listed,
				attempts,
			};
		}
	}

	// The rest are asked at once, since most leave the version out because
	// they do not have it: an episode without a dub then costs one round trip
	// rather than one per provider. The first in priority order that has it wins.
	const unlisted = candidates.filter((candidate) => !lists(candidate));
	const found = (
		await Promise.all(unlisted.map(({ provider, unit }) => resolveWith(provider, unit)))
	).find((result) => result !== null);
	if (found) {
		return {
			...found,
			listed,
			attempts,
		};
	}

	return {
		...hardsubbed,
		version: hardsubbed?.version ?? null,
		listed,
		attempts,
	};
}

/**
 * How the sub's timeline maps onto the dub's, found by aligning the two
 * encodes' segment boundaries (see {@link alignTimelines}). `null` when either
 * is not HLS, a playlist cannot be read, or the encodes do not align.
 */
async function timelineShifts(sub: ProviderVideo[], dub: ProviderVideo[]) {
	const subVideo = sub.find((video) => video.format === "hls");
	const dubVideo = dub.find((video) => video.format === "hls");
	if (!subVideo || !dubVideo) {
		return null;
	}

	const starts = await attempt(
		Promise.all([
			segmentStarts(subVideo.url, subVideo.headers),
			segmentStarts(dubVideo.url, dubVideo.headers),
		]),
		StreamUpstreamError,
	);
	if (starts.error) {
		return null;
	}
	return alignTimelines(...starts.data);
}

/**
 * The sub's WebVTT subtitles moved onto the dub's timeline by `shifts`, and
 * the dub's own signs and captions, which are timed to it already. The sub's
 * are left out when the encodes do not align.
 */
async function subtitlesForDub(
	sub: ProviderVideo[],
	dub: ProviderVideo[],
	streamUrl: (token: string) => string,
	shifts: TimelineShift[] | null,
) {
	const [subKinds, dubKinds] = await Promise.all([subtitleKinds(sub), subtitleKinds(dub)]);
	const retimed = shifts
		? toPlaybackMedia(sub, streamUrl, subKinds, shifts).subtitles.filter(
				(track) => track.format === "vtt",
			)
		: [];

	// Signs and captions exist only on the dub, timed to it as they are. Its
	// dialogue can be the sub's, timed to the sub, so only retiming serves that.
	const own = toPlaybackMedia(dub, streamUrl, dubKinds).subtitles.filter(
		(track) => track.format === "vtt" && (track.kind === "signs" || track.kind === "captions"),
	);

	return withDefault([...retimed, ...own].sort(compareSubtitles));
}

/**
 * The dub's opening and ending on its own timeline.
 *
 * A provider that gives the dub exactly the sub's spans has not timed them to
 * the dub, so they sit as far off as the dub's encode is from the sub's, which
 * can be a whole second. Those move by `shifts`; spans that differ from the
 * sub's were timed to the dub and stay.
 */
function skipSegmentsForDub(
	sub: SkipSegment[],
	dub: SkipSegment[],
	shifts: TimelineShift[] | null,
) {
	const shared =
		sub.length === dub.length &&
		sub.every((segment, index) => {
			const other = dub[index];
			return (
				segment.kind === other?.kind && segment.start === other.start && segment.end === other.end
			);
		});
	if (!shifts || !shared) {
		return dub;
	}

	const moved = (time: number) => Math.max(0, Math.round(shiftTime(shifts, time) * 1_000) / 1_000);
	return sub.map((segment) => ({
		kind: segment.kind,
		start: moved(segment.start),
		end: moved(segment.end),
	}));
}

function toPlaybackMedia(
	videos: ProviderVideo[],
	streamUrl: (token: string) => string,
	kinds: Map<string, SubtitleKind | null>,
	shifts?: TimelineShift[],
) {
	const sources = [...videos]
		.sort((left, right) => qualityRank[left.quality] - qualityRank[right.quality])
		.map((video) => ({
			url: streamUrl(
				createStreamToken(video.url, video.format === "hls" ? "playlist" : "file", video.headers),
			),
			format: video.format,
			quality: video.quality,
		}));

	// Providers attach the same subtitle tracks to every quality variant.
	const subtitles = new Map<string, PlaybackSubtitle>();
	for (const video of videos) {
		for (const track of video.subtitles) {
			if (!subtitles.has(track.url)) {
				subtitles.set(track.url, {
					url: streamUrl(
						createStreamToken(track.url, "subtitle", video.headers, {
							mirrors: mirrorsFor(track.url, video.url),
							shifts,
						}),
					),
					language: track.language,
					label: languageName(track.language) ?? track.label,
					format: track.format,
					kind: kinds.get(track.url) ?? null,
					default: false,
				});
			}
		}
	}

	return {
		sources,
		subtitles: [...subtitles.values()].sort(compareSubtitles),
	};
}

const kindRank = {
	dialogue: 0,
	signs: 1,
	captions: 2,
};

/** English first, then dialogue before signs before captions, then by language. */
function compareSubtitles(left: PlaybackSubtitle, right: PlaybackSubtitle) {
	return (
		Number(isServedSubtitle(right)) - Number(isServedSubtitle(left)) ||
		kindRank[left.kind ?? "dialogue"] - kindRank[right.kind ?? "dialogue"] ||
		left.label.localeCompare(right.label)
	);
}

/**
 * Marks the English dialogue track, which sorts first, as the one a player
 * shows from the start. English that is only signs or captions is not.
 */
function withDefault(subtitles: PlaybackSubtitle[]) {
	return subtitles.map((track, index) => ({
		...track,
		default: index === 0 && isServedSubtitle(track) && (track.kind ?? "dialogue") === "dialogue",
	}));
}

/**
 * Whether a sub's English subtitles can be fetched, so it is watchable. Tracks
 * fall back to the video's host, which often carries them when theirs is
 * unreachable. A sub without English tracks has them burned in, so passes.
 */
async function englishSubtitlesLoad(videos: ProviderVideo[]) {
	const english = videos.flatMap((video) =>
		video.subtitles.filter(isServedSubtitle).map((track) => ({
			track,
			video,
		})),
	);
	if (english.length === 0) {
		return true;
	}

	const loads = await Promise.all(
		english.map(({ track, video }) =>
			canFetchStream(track.url, video.headers, mirrorsFor(track.url, video.url)),
		),
	);
	return loads.includes(true);
}

const audioLabels: Record<ContentLanguage, string> = {
	dub: "Dub",
	sub: "Sub",
	raw: "Raw",
};

const languageNames = new Intl.DisplayNames(["en"], {
	type: "language",
});

/**
 * A language's English name, such as `Brazilian Portuguese` for `pt-BR`, in
 * place of labels providers spell as `Portuguese (- Portuguese(Brazil))`.
 */
function languageName(tag: string) {
	const { data, error } = attempt(() => languageNames.of(tag), RangeError);
	if (error) {
		return null;
	}
	return data && data !== tag ? data : null;
}
