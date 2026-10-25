import { setTimeout as sleep } from "node:timers/promises";

import { attempt, second, defined } from "@sora/shared";
import { z } from "zod";

import { getAnime } from "../../catalog/queries/anime";
import { config } from "../../config";
import { EpisodeNotFoundError, InvalidInputError, PlaybackUnavailableError } from "../../errors";
import type { ProviderAttempt } from "../../errors";
import type { PlaybackMedia, PlaybackSubtitle, SkipSegment } from "../../models/playback";
import type { ContentLanguage } from "../../models/series";
import { requestRefinement } from "../../scheduler/queue";
import { locateEpisode } from "../../series/episodes";
import { getProviderUnits } from "../episodes/episodes";
import type { ProviderUnit } from "../episodes/episodes";
import { getEpisodeVersions } from "../episodes/versions";
import type { EpisodeVersion } from "../episodes/versions";
import type { ProviderVideo, StreamProvider, StreamQuality } from "../providers/provider";
import { isServedSubtitle, servedLocale, streamProviders } from "../providers/registry";
import { canFetchStream, createStreamToken, segmentStarts, tokenLifetimeMs } from "../proxy/proxy";
import { mirrorsFor, StreamUpstreamError } from "../proxy/upstream";
import { getRefinement, isRefinementDue, refinementKey } from "../subtitles/store";
import { alignTimelines, shiftTime } from "./align";
import type { TimelineShift } from "./align";
import { normalizeSkipSegments } from "./skip-lengths";
import type { SkipSource } from "./skip-lengths";
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
	/** The episode's number in the series, from 1. */
	episode: z.number().int().positive(),
	seriesId: z.string().min(1),
});

export type PlaybackRequest = z.input<typeof PlaybackRequestSchema>;

/** What resolving playback reads, asks, and signs with; tests pass their own. */
export interface PlaybackDependencies {
	providers: readonly StreamProvider[];
	locateEpisode: typeof locateEpisode;
	getAnime: typeof getAnime;
	getEpisodeVersions: typeof getEpisodeVersions;
	getProviderUnits: typeof getProviderUnits;
	createStreamToken: typeof createStreamToken;
	segmentStarts: typeof segmentStarts;
	canFetchStream: typeof canFetchStream;
	getRefinement: typeof getRefinement;
	requestRefinement: typeof requestRefinement;
	normalizeSkipSegments: typeof normalizeSkipSegments;
}

const live: PlaybackDependencies = {
	canFetchStream,
	createStreamToken,
	getAnime,
	getEpisodeVersions,
	getProviderUnits,
	getRefinement,
	locateEpisode,
	normalizeSkipSegments,
	providers: streamProviders,
	requestRefinement,
	segmentStarts,
};

/** The URL of a stream token for `createStreamToken`'s arguments. */
type StreamUrl = (...token: Parameters<typeof createStreamToken>) => string;

export interface PlaybackOptions {
	/**
	 * Absolute URL of the proxy route that serves stream tokens, such as
	 * `https://api.example/v1/streams`. Each URL in the playback is a token
	 * under it.
	 */
	streamBaseUrl: string;
	/** The account the playback is for; its tokens work for nobody else. */
	accountId: string;
	/**
	 * How long each version may take to resolve before it is left out, in
	 * milliseconds. {@link playbackDeadlineMs} when left out.
	 */
	deadlineMs?: number;
}

/**
 * How long a version may take to resolve. Providers that hang cost their own
 * timeouts one after another, so without a limit a dead provider chain holds
 * playback for minutes; past this a version is given up on, and the others
 * are still served.
 */
export const playbackDeadlineMs = 30 * second;

/** How long a video's host has to answer before its provider is passed over. */
const videoProbeTimeoutMs = 3 * second;

/** What {@link resolveVersion} found for one version. */
interface VersionResult {
	version: PlaybackMedia | null;
	/** The upstream videos behind `version`. */
	videos?: ProviderVideo[];
	/** The series' other episodes at the provider behind `version`. */
	skipSource?: SkipSource;
	/** Whether a provider serving the locale lists the episode. */
	listed: boolean;
	attempts: ProviderAttempt[];
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
	"1080p": 1,
	"360p": 4,
	"480p": 3,
	"720p": 2,
	auto: 0,
};

/**
 * `resolving`, or an empty result once `deadlineMs` passes. What is still
 * running then is left to finish unused. A version given up on counts as
 * listed, so the failure is "unavailable, try again" rather than "no such
 * episode".
 */
const beforeDeadline = async (
	resolving: Promise<VersionResult>,
	{ language, locale }: EpisodeVersion,
	deadlineMs: number,
) => {
	const stop = new AbortController();
	const gaveUp = async (): Promise<VersionResult> => {
		await attempt(
			sleep(deadlineMs, undefined, {
				signal: stop.signal,
			}),
		);
		return {
			attempts: [
				{
					provider: "all",
					reason: `${language}${locale ? ` (${locale})` : ""}: no answer within ${deadlineMs / second} seconds`,
				},
			],
			listed: true,
			version: null,
		};
	};
	try {
		return await Promise.race([resolving, gaveUp()]);
	} finally {
		stop.abort();
	}
};

/**
 * Whether any of a provider's videos can be fetched, so it is watchable. A
 * host that accepts connections and never answers would otherwise fail every
 * play with a gateway timeout while the next provider sat unused.
 */
const videoLoads = async (videos: ProviderVideo[], dependencies: PlaybackDependencies) => {
	const loads = await Promise.all(
		videos.map((video) =>
			dependencies.canFetchStream(
				video.url,
				video.headers,
				[],
				AbortSignal.timeout(videoProbeTimeoutMs),
			),
		),
	);
	return loads.includes(true);
};

/**
 * Whether a sub's English subtitles can be fetched, so it is watchable. Tracks
 * fall back to the video's host, which often carries them when theirs is
 * unreachable. A sub without English tracks has them burned in, so passes.
 */
const englishSubtitlesLoad = async (
	videos: ProviderVideo[],
	dependencies: PlaybackDependencies,
) => {
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
			dependencies.canFetchStream(track.url, video.headers, mirrorsFor(track.url, video.url)),
		),
	);
	return loads.includes(true);
};

const languageNames = new Intl.DisplayNames(["en"], {
	type: "language",
});

/**
 * A language's English name, such as `Brazilian Portuguese` for `pt-BR`, in
 * place of labels providers spell as `Portuguese (- Portuguese(Brazil))`.
 */
const languageName = (tag: string) => {
	const { data, error } = attempt(() => languageNames.of(tag), RangeError);
	if (error) {
		return null;
	}
	return data && data !== tag ? data : null;
};

const kindRank = {
	captions: 2,
	dialogue: 0,
	signs: 1,
};

/** English first, then dialogue before signs before captions, then by language. */
const compareSubtitles = (left: PlaybackSubtitle, right: PlaybackSubtitle) =>
	Number(isServedSubtitle(right)) - Number(isServedSubtitle(left)) ||
	kindRank[left.kind ?? "dialogue"] - kindRank[right.kind ?? "dialogue"] ||
	left.label.localeCompare(right.label);

const toPlaybackMedia = (
	videos: ProviderVideo[],
	streamUrl: StreamUrl,
	kinds: Map<string, SubtitleKind | null>,
	accountId: string,
	shifts?: TimelineShift[],
	refinement?: string,
) => {
	const sources = [...videos]
		.toSorted((left, right) => qualityRank[left.quality] - qualityRank[right.quality])
		.map((video) => ({
			format: video.format,
			quality: video.quality,
			url: streamUrl(video.url, video.format === "hls" ? "playlist" : "file", video.headers, {
				accountId,
			}),
		}));

	// Providers attach the same subtitle tracks to every quality variant.
	const subtitles = new Map<string, PlaybackSubtitle>();
	for (const video of videos) {
		for (const track of video.subtitles) {
			if (!subtitles.has(track.url)) {
				subtitles.set(track.url, {
					default: false,
					format: track.format,
					kind: kinds.get(track.url) ?? null,
					label: languageName(track.language) ?? track.label,
					language: track.language,
					url: streamUrl(track.url, "subtitle", video.headers, {
						accountId,
						mirrors: mirrorsFor(track.url, video.url),
						refinement,
						shifts,
					}),
				});
			}
		}
	}

	return {
		sources,
		subtitles: [...subtitles.values()].toSorted(compareSubtitles),
	};
};

const audioLabels: Record<ContentLanguage, string> = {
	dub: "Dub",
	raw: "Raw",
	sub: "Sub",
};

/**
 * Marks the English dialogue track, which sorts first, as the one a player
 * shows from the start. English that is only signs or captions is not.
 */
const withDefault = (subtitles: PlaybackSubtitle[]) =>
	subtitles.map((track, index) => ({
		...track,
		default: index === 0 && isServedSubtitle(track) && (track.kind ?? "dialogue") === "dialogue",
	}));

/**
 * Resolves one version of an AniList episode from the first provider that
 * serves its locale and can stream it: those whose episode list has the
 * version, in priority order, then those whose list leaves it out, since
 * lists can be stale or incomplete.
 */
const resolveVersion = async (
	{ language, locale }: EpisodeVersion,
	anilistEpisode: number,
	unitsOf: (provider: StreamProvider) => Promise<ProviderUnit[]>,
	streamUrl: StreamUrl,
	accountId: string,
	dependencies: PlaybackDependencies,
): Promise<VersionResult> => {
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

	// Providers are asked for their episode lists at once; the lists are
	// kept in priority order.
	const asked = dependencies.providers.filter(
		(provider) =>
			provider.locale === servedLocale && (locale === null || provider.locale === locale),
	);
	const unitLists = await Promise.all(asked.map((provider) => attempt(unitsOf(provider))));
	const candidates: {
		provider: StreamProvider;
		unit: ProviderUnit;
	}[] = [];
	for (const [index, provider] of asked.entries()) {
		const units = defined(unitLists[index]);
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

		if (!(await videoLoads(stream.videos, dependencies))) {
			fail(provider, "Video host cannot be reached");
			return null;
		}

		const [loads, kinds] =
			language === "sub"
				? await Promise.all([
						englishSubtitlesLoad(stream.videos, dependencies),
						subtitleKinds(stream.videos),
					])
				: [true, new Map<string, SubtitleKind | null>()];
		if (!loads) {
			fail(provider, "English subtitles cannot be fetched");
			return null;
		}

		const media = toPlaybackMedia(stream.videos, streamUrl, kinds, accountId);
		const version = {
			audio: language,
			hardsub: language === "sub" && !media.subtitles.some(isServedSubtitle),
			label: audioLabels[language],
			locale,
			provider: provider.id,
			skip_segments: stream.skipSegments,
			sources: media.sources,
			// Providers hand a dub the sub's subtitles timed to the sub's encode;
			// resolvePlayback retimes them to the dub's once both are resolved.
			subtitles: language === "sub" ? withDefault(media.subtitles) : [],
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

		const units = await unitsOf(provider);
		return {
			skipSource: {
				episodes: units.map((candidate) => candidate.number),
				skipSegments: async (number: number) => {
					const sibling = units.find((candidate) => candidate.number === number);
					const { data } = sibling
						? await attempt(provider.resolveStream(sibling.id, language))
						: { data: null };
					return data?.skipSegments ?? null;
				},
			},
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
				attempts,
				listed,
			};
		}
	}

	// The rest are asked at once, since most leave the version out because
	// they do not have it: an episode without a dub then costs one round trip
	// rather than one per provider. The first in priority order that has it wins.
	const unlisted = candidates.filter((candidate) => !lists(candidate));
	const resolved = await Promise.all(
		unlisted.map(({ provider, unit }) => resolveWith(provider, unit)),
	);
	const found = resolved.find((result) => result !== null);
	if (found) {
		return {
			...found,
			attempts,
			listed,
		};
	}

	return {
		...hardsubbed,
		attempts,
		listed,
		version: hardsubbed?.version ?? null,
	};
};

/** Resolves every version of an episode at once; see {@link resolvePlayback}. */
const resolveVersions = async (
	{ seriesId, episode }: z.output<typeof PlaybackRequestSchema>,
	streamUrl: StreamUrl,
	accountId: string,
	deadlineMs: number,
	dependencies: PlaybackDependencies,
) => {
	const located = await dependencies.locateEpisode(seriesId, episode);
	const [anime, offered] = await Promise.all([
		dependencies.getAnime(located.anilistId),
		dependencies.getEpisodeVersions(located),
	]);

	// Versions share each provider's episode list.
	const lists = new Map<string, Promise<ProviderUnit[]>>();
	const unitsOf = (provider: StreamProvider) => {
		const list = lists.get(provider.id) ?? dependencies.getProviderUnits(anime, provider);
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
	return Promise.all(
		[...alwaysTried, ...served].map((version) =>
			beforeDeadline(
				resolveVersion(version, located.number, unitsOf, streamUrl, accountId, dependencies),
				version,
				deadlineMs,
			),
		),
	);
};

/**
 * What listening to the dub found for this pair of encodes, and asks the
 * scheduler to listen when nothing has been found yet, or a failed try is
 * old enough to repeat. `null` when either is not HLS.
 */
const storedRefinement = async (
	sub: ProviderVideo[],
	dub: ProviderVideo[],
	request: PlaybackRequest,
	dependencies: PlaybackDependencies,
) => {
	const subVideo = sub.find((video) => video.format === "hls");
	const dubVideo = dub.find((video) => video.format === "hls");
	if (!subVideo || !dubVideo) {
		return null;
	}

	const key = refinementKey(subVideo.url, dubVideo.url);
	const stored = await dependencies.getRefinement(key);
	if (config.subtitleAlignmentPython && isRefinementDue(stored)) {
		// Playback goes on with picture-timed subtitles if the job cannot be queued.
		await attempt(dependencies.requestRefinement({ ...request, key }));
	}

	return {
		key,
		refinement: stored?.refinement ?? null,
	};
};

/**
 * How the sub's timeline maps onto the dub's, found by aligning the two
 * encodes' segment boundaries (see {@link alignTimelines}). `null` when either
 * is not HLS, a playlist cannot be read, or the encodes do not align.
 */
export const timelineShifts = async (
	sub: ProviderVideo[],
	dub: ProviderVideo[],
	dependencies: PlaybackDependencies = live,
) => {
	const subVideo = sub.find((video) => video.format === "hls");
	const dubVideo = dub.find((video) => video.format === "hls");
	if (!subVideo || !dubVideo) {
		return null;
	}

	const starts = await attempt(
		Promise.all([
			dependencies.segmentStarts(subVideo.url, subVideo.headers),
			dependencies.segmentStarts(dubVideo.url, dubVideo.headers),
		]),
		StreamUpstreamError,
	);
	if (starts.error) {
		return null;
	}
	return alignTimelines(...starts.data);
};

/**
 * The sub's WebVTT subtitles moved onto the dub's timeline by `shifts`, and
 * the dub's own signs and captions, which are timed to it already. The sub's
 * are left out when the encodes do not align. With a `refinement`, cues
 * that were matched to the dub's speech go where it says them.
 */
const subtitlesForDub = async (
	sub: ProviderVideo[],
	dub: ProviderVideo[],
	streamUrl: StreamUrl,
	accountId: string,
	shifts: TimelineShift[] | null,
	refinement?: string,
) => {
	const [subKinds, dubKinds] = await Promise.all([subtitleKinds(sub), subtitleKinds(dub)]);
	const retimed = shifts
		? toPlaybackMedia(sub, streamUrl, subKinds, accountId, shifts, refinement).subtitles.filter(
				(track) => track.format === "vtt",
			)
		: [];

	// Signs and captions exist only on the dub, timed to it as they are. Its
	// dialogue can be the sub's, timed to the sub, so only retiming serves that.
	const own = toPlaybackMedia(dub, streamUrl, dubKinds, accountId).subtitles.filter(
		(track) => track.format === "vtt" && (track.kind === "signs" || track.kind === "captions"),
	);

	return withDefault([...retimed, ...own].toSorted(compareSubtitles));
};

/**
 * The dub's opening and ending on its own timeline.
 *
 * A provider that gives the dub exactly the sub's spans has not timed them to
 * the dub, so they sit as far off as the dub's encode is from the sub's, which
 * can be a whole second. Those move by `shifts`; spans that differ from the
 * sub's were timed to the dub and stay.
 */
const skipSegmentsForDub = (
	sub: SkipSegment[],
	dub: SkipSegment[],
	shifts: TimelineShift[] | null,
) => {
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

	const moved = (time: number) => Math.max(0, Math.round(shiftTime(shifts, time) * 1000) / 1000);
	return sub.map((segment) => ({
		end: moved(segment.end),
		kind: segment.kind,
		start: moved(segment.start),
	}));
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
 * @throws {InvalidInputError} when the request fails {@link PlaybackRequestSchema}.
 * @throws {SeriesNotFoundError} when the ID does not identify a series.
 * @throws {EpisodeNotFoundError} when the series has no such episode,
 *   or no provider lists it.
 * @throws {PlaybackUnavailableError} when providers list the episode but
 *   none can currently stream any version of it.
 */
export const resolvePlayback = async (
	request: PlaybackRequest,
	options: PlaybackOptions,
	dependencies: PlaybackDependencies = live,
): Promise<Playback> => {
	const parsed = PlaybackRequestSchema.safeParse(request);
	if (!parsed.success) {
		throw new InvalidInputError("Invalid playback request", {
			cause: parsed.error,
		});
	}

	const { seriesId, episode } = parsed.data;
	// Taken before any token is made, so every token outlives it.
	const expiresAt = new Date(Date.now() + tokenLifetimeMs).toISOString();
	const streamUrl: StreamUrl = (...token) =>
		`${options.streamBaseUrl.replace(/\/$/u, "")}/${encodeURIComponent(dependencies.createStreamToken(...token))}`;
	const results = await resolveVersions(
		parsed.data,
		streamUrl,
		options.accountId,
		options.deadlineMs ?? playbackDeadlineMs,
		dependencies,
	);
	const sub = results.find((result) => result.version?.audio === "sub" && !result.version.hardsub);
	const dub = results.find((result) => result.version?.audio === "dub");
	if (sub?.version && sub.videos && dub?.version && dub.videos) {
		const refined = await storedRefinement(sub.videos, dub.videos, parsed.data, dependencies);
		const shifts =
			refined?.refinement?.shifts ?? (await timelineShifts(sub.videos, dub.videos, dependencies));
		dub.version.subtitles = await subtitlesForDub(
			sub.videos,
			dub.videos,
			streamUrl,
			options.accountId,
			shifts,
			refined?.refinement ? refined.key : undefined,
		);
		dub.version.skip_segments = skipSegmentsForDub(
			sub.version.skip_segments,
			dub.version.skip_segments,
			shifts,
		);
	}

	const media = results.flatMap((result) => (result.version ? [result.version] : []));
	await Promise.all(
		results.map(async ({ version, skipSource }) => {
			if (version) {
				version.skip_segments = await dependencies.normalizeSkipSegments(
					seriesId,
					episode,
					version.audio,
					version.skip_segments,
					skipSource,
				);
			}
		}),
	);
	if (media.length > 0) {
		return {
			episode,
			expiresAt,
			media,
			seriesId,
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
};

/**
 * The upstream videos of an episode's sub and dub, for work that listens to
 * them rather than plays them. `null` for a version no provider can stream,
 * and for a sub whose English subtitles are burned in.
 */
export const resolveStreams = async (
	request: PlaybackRequest,
	dependencies: PlaybackDependencies = live,
) => {
	const parsed = PlaybackRequestSchema.parse(request);
	const results = await resolveVersions(parsed, () => "", "", playbackDeadlineMs, dependencies);
	return {
		dub: results.find((result) => result.version?.audio === "dub")?.videos ?? null,
		sub:
			results.find((result) => result.version?.audio === "sub" && !result.version.hardsub)
				?.videos ?? null,
	};
};
