import { setTimeout as sleep } from "node:timers/promises";

import { attempt, second, defined, sequence } from "@sora/shared";
import { z } from "zod";

import { catalog } from "../../catalog/queries/anime";
import { config } from "../../config";
import { UnknownEpisodeError, InvalidInputError, PlaybackUnavailableError } from "../../errors";
import type { ProviderAttempt } from "../../errors";
import type { PlaybackMedia, PlaybackSubtitle, SkipSegment } from "../../models/playback";
import type { ContentLanguage } from "../../models/series";
import { requestRefinement, requestSkipDetection } from "../../scheduler/queue";
import { locate } from "../../series/episodes";
import { getProviderUnits } from "../episodes/episodes";
import type { ProviderUnit } from "../episodes/episodes";
import { watchable } from "../episodes/versions";
import type { EpisodeVersion } from "../episodes/versions";
import type { ProviderVideo, StreamProvider, StreamQuality } from "../providers/provider";
import { isServedSubtitle, servedLocale, providers } from "../providers/registry";
import {
	canFetchStream,
	createStreamToken,
	readPlaylist,
	streamTimeline,
	tokenLifetimeMs,
	warmStream,
} from "../proxy/proxy";
import type { Playlist, PlaylistReader } from "../proxy/proxy";
import type { StreamTargetKind } from "../proxy/token";
import { mirrorsFor } from "../proxy/upstream";
import { StreamUpstreamError } from "../proxy/upstream-error";
import { loadDetections, isDue, videoKey } from "../skips/store";
import type { SkipDetection, StoredSkipDetection } from "../skips/store";
import { getRefinement, isRefinementDue, refinementKey } from "../subtitles/store";
import { align, shiftTime } from "./align";
import type { TimelineShift } from "./align";
import { hasDubAudio, probeVideos } from "./dub-audio";
import { Menu } from "./menu";
import type { SubtitleKind } from "./subtitle-kind";
import { subtitleKinds } from "./subtitle-kinds";
import { LanguageTag, recordSubtitleLanguages, subtitleLanguagesOf } from "./subtitle-languages";

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
	locateEpisode: typeof locate;
	getAnime: typeof catalog.anime;
	watchable: typeof watchable;
	getProviderUnits: typeof getProviderUnits;
	createStreamToken: typeof createStreamToken;
	streamTimeline: typeof streamTimeline;
	canFetchStream: typeof canFetchStream;
	readPlaylist: PlaylistReader;
	getRefinement: typeof getRefinement;
	requestRefinement: typeof requestRefinement;
	getSkipDetections: typeof loadDetections;
	requestSkipDetection: typeof requestSkipDetection;
	recordSubtitleLanguages: typeof recordSubtitleLanguages;
	warmStream: typeof warmStream;
}

const live: PlaybackDependencies = {
	canFetchStream,
	createStreamToken,
	getAnime: catalog.anime,
	getProviderUnits,
	getRefinement,
	getSkipDetections: loadDetections,
	locateEpisode: locate,
	providers,
	readPlaylist,
	recordSubtitleLanguages,
	requestRefinement,
	requestSkipDetection,
	streamTimeline,
	warmStream,
	watchable,
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

/** What resolving found for one version. */
interface VersionResult {
	version: PlaybackMedia | null;
	/** The upstream videos behind `version`. */
	videos?: ProviderVideo[];
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

/**
 * How the sub's timeline maps onto the dub's, found by aligning the two
 * encodes' segment boundaries (see {@link align}). `null` when either
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

	const timelines = await attempt(
		Promise.all([
			dependencies.streamTimeline(subVideo.url, subVideo.headers, dependencies.readPlaylist),
			dependencies.streamTimeline(dubVideo.url, dubVideo.headers, dependencies.readPlaylist),
		]),
		StreamUpstreamError,
	);

	if (timelines.error) {
		return null;
	}

	const [subTimeline, dubTimeline] = timelines.data;

	return align(subTimeline.starts, dubTimeline.starts);
};

/**
 * A provider's segments that fit the video they came with. A segment that
 * starts after the video ends was timed to another cut of the episode, such
 * as one that still has the opening and ending a shorter cut leaves out, and
 * so was every other segment the provider gave that video: none is kept.
 * With the length unknown, they are kept as they are.
 */
export const fitToVideo = (segments: SkipSegment[], duration: number | null) => {
	if (duration === null) {
		return segments;
	}

	if (segments.some((segment) => segment.start >= duration - 1)) {
		return [];
	}

	return segments.map((segment) => ({
		...segment,
		end: Math.min(segment.end, duration),
	}));
};

/**
 * A version's segments with what looking for its theme songs in its own
 * audio settled (see `locateSongs`): a song found replaces the
 * provider's segment of its kind, an opening song that plays only late in the
 * video leaves no opening, and a kind nothing was settled for keeps the
 * provider's segment.
 */
export const withDetection = (
	segments: SkipSegment[],
	detection: SkipDetection | undefined,
): SkipSegment[] => {
	const kinds = ["opening", "ending"] as const satisfies readonly SkipSegment["kind"][];

	return kinds
		.flatMap((kind): SkipSegment[] => {
			const found = detection?.[kind];

			if (found === "none") {
				return [];
			}

			if (found) {
				return [
					{
						end: found.end,
						kind,
						start: found.start,
					},
				];
			}

			return segments.filter((segment) => segment.kind === kind);
		})
		.toSorted((left, right) => left.start - right.start);
};

/**
 * Resolving an episode's versions for one account: the token URLs it signs,
 * how long each version may take, and what it reads and asks.
 */
class Resolution {
	readonly #tokenUrl: StreamUrl;
	readonly #accountId: string;
	readonly #deadlineMs: number;
	readonly #dependencies: PlaybackDependencies;

	constructor(
		tokenUrl: StreamUrl,
		accountId: string,
		deadlineMs: number,
		dependencies: PlaybackDependencies,
	) {
		this.#tokenUrl = tokenUrl;
		this.#accountId = accountId;
		this.#deadlineMs = deadlineMs;
		this.#dependencies = dependencies;
	}

	/** Resolves every version of an episode at once; see {@link streams.resolve}. */
	async versions({ seriesId, episode }: z.output<typeof PlaybackRequestSchema>) {
		const dependencies = this.#dependencies;
		const located = await dependencies.locateEpisode(seriesId, episode);

		const [anime, offered] = await Promise.all([
			dependencies.getAnime(located.anilistId),
			dependencies.watchable(located),
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
				this.#beforeDeadline(this.#version(version, located.number, unitsOf), version),
			),
		);
	}

	/**
	 * Gives the dub its subtitles (see {@link Resolution.#dubSubtitles}), and,
	 * when a sub with tracks was resolved too, its opening and ending on its own
	 * timeline.
	 *
	 * A provider that gives the dub exactly the sub's spans has not timed them to
	 * the dub, so they sit as far off as the dub's encode is from the sub's, which
	 * can be a whole second. Those move by the shifts; spans that differ from the
	 * sub's were timed to the dub and stay.
	 */
	async fitDub(results: VersionResult[], request: PlaybackRequest) {
		const sub = results.find(
			(result) => result.version?.audio === "sub" && !result.version.hardsub,
		);

		const dub = results.find((result) => result.version?.audio === "dub");

		if (!dub?.version || !dub.videos) {
			return;
		}

		// A sub with burned-in subtitles, or none, has nothing to retime, but
		// the dub keeps its own signs and captions.
		let shifts: TimelineShift[] | null = null;
		let refinement: string | undefined;

		if (sub?.version && sub.videos) {
			const refined = await this.#storedRefinement(sub.videos, dub.videos, request);

			const aligned =
				refined?.refinement?.shifts ??
				(await timelineShifts(sub.videos, dub.videos, this.#dependencies));

			shifts = aligned;

			if (refined?.refinement) {
				refinement = refined.key;
			}

			const subSegments = sub.version.skip_segments;
			const dubSegments = dub.version.skip_segments;

			const shared =
				subSegments.length === dubSegments.length &&
				subSegments.every((segment, index) => {
					const other = dubSegments[index];

					return (
						segment.kind === other?.kind &&
						segment.start === other.start &&
						segment.end === other.end
					);
				});

			if (aligned && shared) {
				const moved = (time: number) =>
					Math.max(0, Math.round(shiftTime(aligned, time) * 1000) / 1000);

				dub.version.skip_segments = subSegments.map((segment) => ({
					end: moved(segment.end),
					kind: segment.kind,
					start: moved(segment.start),
				}));
			}
		}

		dub.version.subtitles = await this.#dubSubtitles(
			sub?.videos ?? [],
			dub.videos,
			shifts,
			refinement,
		);
	}

	/**
	 * Brings each version's skip segments to its own video: the provider's that
	 * do not fit it are dropped (see {@link fitToVideo}), and what looking for the
	 * theme songs in its audio settled takes their place (see
	 * {@link withDetection}). Videos not looked at yet are queued for it, and so
	 * is the next episode, so its segments are settled before it is played.
	 */
	async settleSkips(results: VersionResult[], request: z.output<typeof PlaybackRequestSchema>) {
		/**
		 * How long checking skip segments against a video's length may hold playback;
		 * past it they go unchecked.
		 */
		const lengthCheckMs = 2 * second;

		const dependencies = this.#dependencies;

		const versions = results.flatMap(({ version, videos }) => {
			const video = videos?.find((candidate) => candidate.format === "hls");

			if (version && video) {
				return [
					{
						key: videoKey(video.url),
						version,
						video,
					},
				];
			}

			return [];
		});

		// Skip segments only add to playback, so nothing here may fail or hold it:
		// without stored detections or the video's length, the provider's stand.
		const stored = await attempt(dependencies.getSkipDetections(versions.map(({ key }) => key)));
		const detections = stored.data ?? new Map<string, StoredSkipDetection>();

		await Promise.all(
			versions.map(async ({ key, version, video }) => {
				const timeline = await attempt(
					Promise.race([
						dependencies.streamTimeline(video.url, video.headers, dependencies.readPlaylist),
						sleep(lengthCheckMs).then(() => null),
					]),
				);

				version.skip_segments = withDetection(
					fitToVideo(version.skip_segments, timeline.data?.duration ?? null),
					detections.get(key)?.detection,
				);
			}),
		);

		if (versions.some(({ key }) => isDue(detections.get(key)))) {
			void attempt(dependencies.requestSkipDetection(request));
		}

		// Looked at ahead of time, so its segments are settled before it is played.
		void attempt(
			dependencies.requestSkipDetection({
				...request,
				ahead: true,
				episode: request.episode + 1,
			}),
		);
	}

	/**
	 * `resolving`, or an empty result once the deadline passes. What is still
	 * running then is left to finish unused. A version given up on counts as
	 * listed, so the failure is "unavailable, try again" rather than "no such
	 * episode".
	 */
	async #beforeDeadline(resolving: Promise<VersionResult>, { language, locale }: EpisodeVersion) {
		const deadlineMs = this.#deadlineMs;
		const stop = new AbortController();
		let named: string = language;

		if (locale) {
			named = `${language} (${locale})`;
		}

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
						reason: `${named}: no answer within ${deadlineMs / second} seconds`,
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
	}

	/**
	 * Whether a sub's English subtitles can be fetched, so it is watchable. Tracks
	 * fall back to the video's host, which often carries them when theirs is
	 * unreachable. A sub without English tracks has them burned in, so passes.
	 */
	async #subtitlesLoad(videos: ProviderVideo[]) {
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
				this.#dependencies.canFetchStream(
					track.url,
					video.headers,
					mirrorsFor(track.url, video.url),
				),
			),
		);

		return loads.includes(true);
	}

	/** A version's sources and subtitles, as `tokenUrl` signs their URLs. */
	#media(
		videos: ProviderVideo[],
		tokenUrl: StreamUrl,
		kinds: Map<string, SubtitleKind | null>,
		shifts?: TimelineShift[],
		refinement?: string,
	) {
		const qualityRank: Record<StreamQuality, number> = {
			"1080p": 1,
			"360p": 4,
			"480p": 3,
			"720p": 2,
			auto: 0,
		};

		/** How a subtitle menu names each kind after the language; dialogue goes unnamed. */
		const kindLabels: Partial<Record<SubtitleKind, string>> = {
			captions: "CC",
			signs: "Signs",
		};

		const accountId = this.#accountId;

		const sources = [...videos]
			.toSorted((left, right) => qualityRank[left.quality] - qualityRank[right.quality])
			.map((video) => {
				let kind: StreamTargetKind = "file";

				if (video.format === "hls") {
					kind = "playlist";
				}

				return {
					format: video.format,
					quality: video.quality,
					url: tokenUrl(video.url, kind, video.headers, {
						accountId,
					}),
				};
			});

		// Providers attach the same subtitle tracks to every quality variant.
		const subtitles = new Map<string, PlaybackSubtitle>();

		for (const video of videos) {
			for (const track of video.subtitles) {
				if (subtitles.has(track.url)) {
					continue;
				}

				const kind = kinds.get(track.url);
				const language = new LanguageTag(track.language).name ?? track.label;
				let named: string | undefined;

				if (kind) {
					named = kindLabels[kind];
				}

				// A track's name in a subtitle menu: its language, and its kind unless dialogue, as `English (CC)`.
				let label = language;

				if (named) {
					label = `${language} (${named})`;
				}

				subtitles.set(track.url, {
					default: false,
					format: track.format,
					kind: kind ?? null,
					label,
					language: track.language,
					url: tokenUrl(track.url, "subtitle", video.headers, {
						accountId,
						mirrors: mirrorsFor(track.url, video.url),
						refinement,
						shifts,
					}),
				});
			}
		}

		return {
			sources,
			subtitles: [...subtitles.values()],
		};
	}

	/**
	 * Resolves one version of an AniList episode from the first provider that
	 * serves its locale and can stream it: those whose episode list has the
	 * version, in priority order, then those whose list leaves it out, since
	 * lists can be stale or incomplete.
	 */
	async #version(
		{ language, locale }: EpisodeVersion,
		anilistEpisode: number,
		unitsOf: (provider: StreamProvider) => Promise<ProviderUnit[]>,
	): Promise<VersionResult> {
		const audioLabels: Record<ContentLanguage, string> = {
			dub: "Dub",
			raw: "Raw",
			sub: "Sub",
		};

		const dependencies = this.#dependencies;
		const tokenUrl = this.#tokenUrl;
		const attempts: ProviderAttempt[] = [];
		let named: string = language;

		if (locale) {
			named = `${language} (${locale})`;
		}

		const fail = (provider: StreamProvider, reason: string) =>
			attempts.push({
				provider: provider.id,
				reason: `${named}: ${reason}`,
			});

		let hardsubbed:
			| {
					version: PlaybackMedia;
					videos: ProviderVideo[];
			  }
			| undefined;

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

		// A dub's playlist can carry every audio language, the original first;
		// the proxy makes the dub's the one players start with.
		let versionUrl = tokenUrl;

		if (language === "dub") {
			versionUrl = (url, kind, headers, options) => {
				if (kind !== "playlist") {
					return tokenUrl(url, kind, headers, options);
				}

				return tokenUrl(url, kind, headers, {
					...options,
					audio: servedLocale,
				});
			};
		}

		/** Resolves the version from one provider; `null`, with the reason recorded, when it cannot. */
		const fromProvider = async (provider: StreamProvider, unit: ProviderUnit) => {
			const resolved = await attempt(provider.resolveStream(unit.id, language));

			if (resolved.error) {
				fail(provider, resolved.error.message);

				return null;
			}

			const stream = resolved.data;

			const probes = await probeVideos(stream.videos, dependencies);

			if (!probes.some((probe) => probe !== null)) {
				fail(provider, "Video host cannot be reached");

				return null;
			}

			if (language === "dub" && !hasDubAudio(probes)) {
				fail(provider, `No audio in ${servedLocale}`);

				return null;
			}

			let kinds: Map<string, SubtitleKind | null>;

			if (language === "sub") {
				const [subtitlesLoad, subKinds] = await Promise.all([
					this.#subtitlesLoad(stream.videos),
					subtitleKinds(stream.videos),
				]);

				if (!subtitlesLoad) {
					fail(provider, "English subtitles cannot be fetched");

					return null;
				}

				kinds = subKinds;
			} else {
				kinds = new Map();
			}

			const media = this.#media(stream.videos, versionUrl, kinds);

			// Providers hand a dub the sub's subtitles timed to the sub's encode;
			// streams.resolve retimes them to the dub's and adds the dub's own
			// signs and captions.
			let subtitles: PlaybackSubtitle[] = [];

			if (language === "sub") {
				subtitles = new Menu(media.subtitles).ordered(language);
			}

			const version = {
				audio: language,
				hardsub: language === "sub" && !media.subtitles.some(isServedSubtitle),
				label: audioLabels[language],
				locale,
				provider: provider.id,
				skip_segments: stream.skipSegments,
				sources: media.sources,
				subtitles,
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

		const foundInOrder = await sequence.first(candidates.filter(lists), ({ provider, unit }) =>
			fromProvider(provider, unit),
		);

		if (foundInOrder) {
			return {
				...foundInOrder,
				attempts,
				listed,
			};
		}

		// The rest are asked at once, since most leave the version out because
		// they do not have it: an episode without a dub then costs one round trip
		// rather than one per provider. The first in priority order that has it wins.
		const unlisted = candidates.filter((candidate) => !lists(candidate));

		const resolved = await Promise.all(
			unlisted.map(({ provider, unit }) => fromProvider(provider, unit)),
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
	}

	/**
	 * What listening to the dub found for this pair of encodes, and asks the
	 * scheduler to listen when nothing has been found yet, or a failed try is
	 * old enough to repeat. `null` when either is not HLS.
	 */
	async #storedRefinement(sub: ProviderVideo[], dub: ProviderVideo[], request: PlaybackRequest) {
		const subVideo = sub.find((video) => video.format === "hls");
		const dubVideo = dub.find((video) => video.format === "hls");

		if (!subVideo || !dubVideo) {
			return null;
		}

		const key = refinementKey(subVideo.url, dubVideo.url);
		const stored = await this.#dependencies.getRefinement(key);

		if (config.subtitleAlignmentPython && isRefinementDue(stored)) {
			// Playback goes on with picture-timed subtitles if the job cannot be queued.
			await attempt(
				this.#dependencies.requestRefinement({
					...request,
					key,
				}),
			);
		}

		return {
			key,
			refinement: stored?.refinement ?? null,
		};
	}

	/**
	 * The dub's subtitles: the sub's WebVTT ones moved onto the dub's timeline by
	 * `shifts`, and the dub's own signs and captions, which are timed to it
	 * already. Without `shifts`, because no sub has tracks or the encodes do not
	 * align, the dub has only its own. With a `refinement`, cues that were
	 * matched to the dub's speech go where it says them.
	 */
	async #dubSubtitles(
		sub: ProviderVideo[],
		dub: ProviderVideo[],
		shifts: TimelineShift[] | null,
		refinement?: string,
	) {
		const [subKinds, dubKinds] = await Promise.all([
			shifts && subtitleKinds(sub),
			subtitleKinds(dub),
		]);

		let retimed: PlaybackSubtitle[] = [];

		if (shifts && subKinds) {
			retimed = this.#media(sub, this.#tokenUrl, subKinds, shifts, refinement).subtitles.filter(
				(track) => track.format === "vtt",
			);
		}

		// Signs and captions exist only on the dub, timed to it as they are. Its
		// dialogue can be the sub's, timed to the sub, so only retiming serves that.
		const own = this.#media(dub, this.#tokenUrl, dubKinds).subtitles.filter(
			(track) => track.format === "vtt" && (track.kind === "signs" || track.kind === "captions"),
		);

		return new Menu([...retimed, ...own]).ordered("dub");
	}
}

/**
 * Looks at which subtitle languages an episode's streams have, for a series
 * nobody has played yet, and stores them as playing it would; see
 * `seriesSubtitles`. Nothing is played, so no stream is warmed and no dub is
 * listened to. An episode nobody can stream stores none, so the series is
 * not looked at again until it is played.
 *
 * @throws {UnknownSeriesError} when the ID does not identify a series.
 * @throws {UnknownEpisodeError} when the series has no such episode.
 */
export const probeSubtitleLanguages = async (
	request: PlaybackRequest,
	dependencies: PlaybackDependencies = live,
) => {
	const parsed = PlaybackRequestSchema.parse(request);
	const resolution = new Resolution(() => "", "", playbackDeadlineMs, dependencies);
	const results = await resolution.versions(parsed);
	const languages = subtitleLanguagesOf(results);
	await dependencies.recordSubtitleLanguages(parsed.seriesId, languages);

	return languages;
};

export const streams = {
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
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 * @throws {UnknownEpisodeError} when the series has no such episode,
	 *   or no provider lists it.
	 * @throws {PlaybackUnavailableError} when providers list the episode but
	 *   none can currently stream any version of it.
	 */
	async resolve(
		request: PlaybackRequest,
		options: PlaybackOptions,
		dependencies: PlaybackDependencies = live,
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

		const tokenUrl: StreamUrl = (...token) =>
			`${options.streamBaseUrl.replace(/\/$/u, "")}/${encodeURIComponent(dependencies.createStreamToken(...token))}`;

		// Each playlist is read once per playback, by the probe that picks a
		// provider, the warm-up, aligning a dub to its sub, and the length check of
		// skip segments; an episode's sub and dub often share one. A read that
		// failed is not kept, so the next asks again.
		const playlists = new Map<string, Promise<Playlist>>();

		const readOnce: PlaybackDependencies = {
			...dependencies,
			readPlaylist: (url, headers, readOptions) => {
				const kept = playlists.get(url);

				if (kept) {
					return kept;
				}

				const read = dependencies.readPlaylist(url, headers, readOptions);
				playlists.set(url, read);
				read.catch(() => playlists.delete(url));

				return read;
			},
		};

		const resolution = new Resolution(
			tokenUrl,
			options.accountId,
			options.deadlineMs ?? playbackDeadlineMs,
			readOnce,
		);

		const results = await resolution.versions(parsed.data);

		// The first version is the one played by default, so its first segments are
		// loaded while the rest of the playback is put together and the player starts.
		const defaultVideo = results
			.find((result) => result.version)
			?.videos?.find((candidate) => candidate.format === "hls");

		if (defaultVideo) {
			void attempt(
				dependencies.warmStream(defaultVideo.url, defaultVideo.headers, readOnce.readPlaylist),
			);
		}

		await resolution.fitDub(results, parsed.data);
		await resolution.settleSkips(results, parsed.data);

		const media = results.flatMap((result) => {
			if (result.version) {
				return [result.version];
			}

			return [];
		});

		if (media.length > 0) {
			await dependencies.recordSubtitleLanguages(seriesId, subtitleLanguagesOf(results));

			return {
				episode,
				expiresAt,
				media,
				seriesId,
			};
		}

		if (!results.some((result) => result.listed)) {
			throw new UnknownEpisodeError(seriesId, episode);
		}

		throw new PlaybackUnavailableError(
			seriesId,
			episode,
			results.flatMap((result) => result.attempts),
		);
	},

	/**
	 * The upstream videos of every version of an episode a provider can stream
	 * right now, burned-in subs included, for work that reads them rather than
	 * plays them.
	 */
	async videos(request: PlaybackRequest, dependencies: PlaybackDependencies = live) {
		const parsed = PlaybackRequestSchema.parse(request);
		const resolution = new Resolution(() => "", "", playbackDeadlineMs, dependencies);
		const results = await resolution.versions(parsed);

		return results.flatMap(({ version, videos }) => {
			if (version && videos) {
				return [
					{
						audio: version.audio,
						videos,
					},
				];
			}

			return [];
		});
	},
};

/**
 * The upstream videos of an episode's sub and dub, for work that listens to
 * them rather than plays them. `null` for a version no provider can stream,
 * and for a sub whose English subtitles are burned in.
 */
export const subAndDub = async (
	request: PlaybackRequest,
	dependencies: PlaybackDependencies = live,
) => {
	const parsed = PlaybackRequestSchema.parse(request);
	const resolution = new Resolution(() => "", "", playbackDeadlineMs, dependencies);
	const results = await resolution.versions(parsed);

	return {
		dub: results.find((result) => result.version?.audio === "dub")?.videos ?? null,
		sub:
			results.find((result) => result.version?.audio === "sub" && !result.version.hardsub)
				?.videos ?? null,
	};
};
