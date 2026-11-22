import { beforeEach, describe, expect, test } from "bun:test";

import { defined } from "@sora/shared";

import { anime } from "../../catalog/models/anime.fixture";
import { EpisodeNotFoundError, PlaybackUnavailableError } from "../../errors";
import type { SkipSegment } from "../../models/playback";
import type { ContentLanguage } from "../../models/series";
import type { EpisodeVersion } from "../episodes/versions";
import type { ProviderStream, ProviderVideo, StreamProvider } from "../providers/provider";
import { master } from "../proxy/playlist.fixture";
import { StreamUpstreamError } from "../proxy/upstream-error";
import { skipDetectionKey } from "../skips/store";
import type { StoredSkipDetection } from "../skips/store";
import type { getRefinement } from "../subtitles/store";
import { refinementKey } from "../subtitles/store";
import { Encode } from "./align.fixture";
import { resolvePlayback } from "./resolve";
import type { PlaybackDependencies } from "./resolve";
import { dub, sub } from "./resolve.fixture";

/** A provider stand-in that lists episode 3 and streams the languages it has. */
interface FakeProvider {
	id: string;
	locale: string;
	/** The languages its stored episode list gives episode 3. */
	languages: ContentLanguage[];
	/** The languages its player streams, when they differ from what its list says. */
	streams?: ContentLanguage[];
	/** How long it takes to answer, in milliseconds. */
	delayMs?: number;
	fails?: boolean;
	/** Whether its streams come without their usual subtitle tracks, such as hardsubbed ones. */
	noSubtitles?: boolean;
	/** Whether its subtitle files cannot be fetched from any host. */
	unreachableSubtitles?: boolean;
	/** Whether its videos cannot be fetched from any host. */
	unreachableVideo?: boolean;
	/** The skip segments its player ships with each language's stream. */
	skipSegments?: Partial<Record<ContentLanguage, SkipSegment[]>>;
	/** Subtitle tracks only one language's stream carries, by their labels. */
	extraSubtitles?: Partial<Record<ContentLanguage, string[]>>;
	/** The audio languages its dub's playlist lists; none named when left out. */
	dubAudio?: string[];
	/** Whether its sub and dub are one playlist with both audios, as MegaPlay's newer episodes are. */
	sharedPlaylist?: boolean;
}

const units = new Map<string, ContentLanguage[]>();

/** The audio languages each playlist lists, by playlist URL; none named when missing. */
const audioLanguages = new Map<string, string[]>();

/** The playlists `readPlaylist` was asked for. */
const read: string[] = [];
const resolved: string[] = [];

/** Segment start times `streamTimeline` hands out, by playlist URL. */
const timelines = new Map<string, number[]>();

/** Video lengths `streamTimeline` hands out, by playlist URL; unknown when missing. */
const durations = new Map<string, number>();

/** What `getSkipDetections` finds, by video key. */
const detections = new Map<string, StoredSkipDetection>();

/** Episodes `requestSkipDetection` was asked for. */
const detectionRequests: number[] = [];

/** What `getRefinement` finds, by the key of a pair of encodes. */
const refinements = new Map<string, Awaited<ReturnType<typeof getRefinement>>>();

const request = {
	episode: 3,
	seriesId: "series",
};

const options = {
	accountId: "account",
	streamBaseUrl: "https://sora.example/v1/streams/",
};

/** The fake providers and stored lists resolving asks, and the dependencies that reach them. */
class Fake {
	/** The versions the stored episode lists offer, for `getEpisodeVersions`. */
	offered: EpisodeVersion[] = [];

	/** The providers resolving asks, filled in place by {@link Fake.use}. */
	readonly providers: StreamProvider[] = [];

	readonly dependencies: PlaybackDependencies = {
		canFetchStream: (url) => Promise.resolve(!url.includes(".unreachable.")),
		createStreamToken: (url, _kind, _headers, signed) => {
			let token = `token:${url}`;

			if (signed?.shifts) {
				token = `${token}@${JSON.stringify(signed.shifts)}`;
			}

			if (signed?.shifts && signed.refinement) {
				token = `${token}#${signed.refinement}`;
			}

			if (signed?.audio) {
				return `${token}~${signed.audio}`;
			}

			return token;
		},
		getAnime: (id) => Promise.resolve(anime(id)),
		getEpisodeVersions: () => Promise.resolve(this.offered),
		getProviderUnits: (_anime, provider) =>
			Promise.resolve([
				{
					id: `${provider.id}:3`,
					isFiller: null,
					languages: units.get(provider.id) ?? null,
					number: 3,
					title: "Episode 3",
				},
			]),
		getRefinement: (key) => Promise.resolve(refinements.get(key) ?? null),
		getSkipDetections: (keys) =>
			Promise.resolve(
				new Map(
					keys.flatMap((key) => {
						if (detections.has(key)) {
							return [[key, defined(detections.get(key))]];
						}

						return [];
					}),
				),
			),
		locateEpisode: (seriesId) =>
			Promise.resolve({
				anilistId: 154_587,
				number: 3,
				seriesId,
			}),
		providers: this.providers,
		readPlaylist: (url) => {
			read.push(url);

			if (url.includes(".unreachable.")) {
				return Promise.reject(new StreamUpstreamError("Upstream could not be reached", null));
			}

			return Promise.resolve({
				content: master(audioLanguages.get(url) ?? []),
				url,
			});
		},
		recordSubtitleLanguages: async () => {},
		requestRefinement: async () => {},
		requestSkipDetection: (payload) => {
			detectionRequests.push(payload.episode);

			return Promise.resolve();
		},
		streamTimeline: (url) =>
			Promise.resolve({
				duration: durations.get(url) ?? null,
				starts: timelines.get(url) ?? [],
			}),
		warmStream: () => Promise.resolve(),
	};

	/** Makes `list` the providers resolving asks. */
	use(list: FakeProvider[]) {
		units.clear();
		audioLanguages.clear();
		this.providers.splice(
			0,
			this.providers.length,
			...list.map((provider) => {
				units.set(provider.id, provider.languages);

				let dubPlaylist = "dub";

				if (provider.sharedPlaylist) {
					dubPlaylist = "master";
				}

				if (provider.dubAudio) {
					audioLanguages.set(
						`https://${provider.id}.example/${dubPlaylist}.m3u8`,
						provider.dubAudio,
					);
				}

				return {
					findMedia: () => Promise.resolve(null),
					id: provider.id,
					listEpisodes: () => Promise.resolve([]),
					listsLanguages: true,
					locale: provider.locale,
					resolveStream: async (
						episodeId: string,
						language: ContentLanguage,
					): Promise<ProviderStream> => {
						resolved.push(`${episodeId}/${language}`);
						await Bun.sleep(provider.delayMs ?? 0);

						if (provider.fails) {
							throw new Error(`${provider.id} is down`);
						}

						if (!(provider.streams ?? provider.languages).includes(language)) {
							throw new Error(`${provider.id} has no ${language} source`);
						}

						const subtitles: ProviderVideo["subtitles"] = [];

						if (!provider.noSubtitles) {
							let englishHost = `${provider.id}.example`;

							if (provider.unreachableSubtitles) {
								englishHost = `${provider.id}.unreachable.example`;
							}

							subtitles.push(
								{
									format: "vtt",
									label: "English",
									language: "en",
									url: `https://${englishHost}/en.vtt`,
								},
								{
									format: null,
									label: "Portuguese",
									language: "pt",
									url: `https://${provider.id}.example/pt.vtt`,
								},
							);
						}

						for (const label of provider.extraSubtitles?.[language] ?? []) {
							subtitles.push({
								format: "vtt",
								label,
								language: "en",
								url: `https://${provider.id}.example/${encodeURIComponent(label)}.vtt`,
							});
						}

						let videoHost = `${provider.id}.example`;
						let playlist: string = language;

						if (provider.unreachableVideo) {
							videoHost = `${provider.id}.unreachable.example`;
						}

						if (provider.sharedPlaylist) {
							playlist = "master";
						}

						return {
							skipSegments: provider.skipSegments?.[language] ?? [],
							videos: [
								{
									format: "hls",
									headers: {},
									quality: "auto",
									subtitles,
									url: `https://${videoHost}/${playlist}.m3u8`,
								},
							],
						};
					},
				};
			}),
		);
	}

	/** Each resolved version as `language/locale@provider`. */
	async versions() {
		const playback = await resolvePlayback(request, options, this.dependencies);

		return playback.media.map(
			(version) => `${version.audio}/${version.locale}@${version.provider}`,
		);
	}
}

const fake = new Fake();
const { dependencies } = fake;

beforeEach(() => {
	resolved.length = 0;
	read.length = 0;
	fake.offered = [];
	timelines.clear();
	durations.clear();
	detections.clear();
	detectionRequests.length = 0;
	refinements.clear();
});

describe("resolvePlayback", () => {
	test("serves English dub and sub together, never another locale", async () => {
		fake.use([
			{
				id: "brazilian",
				languages: ["dub"],
				locale: "pt-BR",
			},
			{
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
			},
		]);
		fake.offered = [dub(), dub("pt-BR"), sub()];

		expect(await fake.versions()).toEqual(["dub/en@anikoto", "sub/en@anikoto"]);
		await expect(resolvePlayback(request, options, dependencies)).resolves.toMatchObject({
			episode: 3,
			seriesId: "series",
		});
	});

	test("says when its stream URLs expire", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub"],
				locale: "en",
			},
		]);
		fake.offered = [sub()];

		const before = Date.now();
		const { expiresAt } = await resolvePlayback(request, options, dependencies);
		expect(Date.parse(expiresAt) - before).toBeGreaterThanOrEqual(6 * 60 * 60 * 1000);
		expect(Date.parse(expiresAt) - Date.now()).toBeLessThanOrEqual(6 * 60 * 60 * 1000);
	});

	test("gives each version the skip segments of its own stream", async () => {
		// Attack on Titan episode 1: the dub's opening starts 16 seconds later.
		fake.use([
			{
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
				skipSegments: {
					dub: [
						{
							end: 230,
							kind: "opening",
							start: 154,
						},
					],
					sub: [
						{
							end: 215,
							kind: "opening",
							start: 138,
						},
					],
				},
			},
		]);
		fake.offered = [dub(), sub()];

		const playback = await resolvePlayback(request, options, dependencies);
		expect(playback.media.map((media) => [media.audio, media.skip_segments[0]?.start])).toEqual([
			["dub", 154],
			["sub", 138],
		]);
	});

	describe("a dub given the sub's skip segments", () => {
		const spans = [
			{
				end: 312,
				kind: "opening" as const,
				start: 213,
			},
			{
				end: 1418,
				kind: "ending" as const,
				start: 1328,
			},
		];

		const dubbedSkipSegments = async (dubOffset: number | null, dubSpans = spans) => {
			fake.use([
				{
					id: "anikoto",
					languages: ["sub", "dub"],
					locale: "en",
					skipSegments: {
						dub: dubSpans,
						sub: spans,
					},
				},
			]);
			fake.offered = [dub(), sub()];
			const subTimeline = new Encode(1).boundaries;
			let dubTimeline = new Encode(2).boundaries;

			if (dubOffset !== null) {
				dubTimeline = subTimeline.map((time) => time + dubOffset);
			}

			timelines.set("https://anikoto.example/sub.m3u8", subTimeline);
			timelines.set("https://anikoto.example/dub.m3u8", dubTimeline);

			const playback = await resolvePlayback(request, options, dependencies);
			const [dubbed, subbed] = playback.media;

			return [dubbed?.skip_segments, subbed?.skip_segments];
		};

		test("moves them onto the dub's timeline by how far its encode is from the sub's", async () => {
			const [dubbed, subbed] = await dubbedSkipSegments(-1);
			expect(dubbed).toEqual([
				{
					end: 311,
					kind: "opening",
					start: 212,
				},
				{
					end: 1417,
					kind: "ending",
					start: 1327,
				},
			]);
			expect(subbed).toEqual(spans);
		});

		test("leaves spans that differ from the sub's, since they were timed to the dub", async () => {
			const own = [
				{
					end: 313,
					kind: "opening" as const,
					start: 214,
				},
			];

			const segments = await dubbedSkipSegments(-1, own);

			expect(segments[0]).toEqual(own);
		});

		test("leaves them when the encodes do not align", async () => {
			const segments = await dubbedSkipSegments(null);

			expect(segments[0]).toEqual(spans);
		});
	});

	describe("skip segments and the video they came with", () => {
		const subUrl = "https://anikoto.example/sub.m3u8";

		const provided = [
			{
				end: 108,
				kind: "opening" as const,
				start: 0,
			},
			{
				end: 1448,
				kind: "ending" as const,
				start: 1351,
			},
		];

		const subSkipSegments = async (segments: SkipSegment[] = provided) => {
			fake.use([
				{
					id: "anikoto",
					languages: ["sub"],
					locale: "en",
					skipSegments: {
						sub: segments,
					},
				},
			]);
			fake.offered = [sub()];
			const playback = await resolvePlayback(request, options, dependencies);

			return playback.media[0]?.skip_segments;
		};

		test("drops them all when one starts after the video ends, since they were timed to another cut", async () => {
			// Dragon Ball: a 1244 s cut without its opening and ending, given the full episode's.
			durations.set(subUrl, 1244);

			expect(await subSkipSegments()).toEqual([]);
		});

		test("ends a segment that runs past the video at its end", async () => {
			durations.set(subUrl, 1440);

			const segments = await subSkipSegments();
			expect(segments?.at(-1)).toEqual({
				end: 1440,
				kind: "ending",
				start: 1351,
			});
		});

		test("keeps them when the video's length cannot be read", async () => {
			expect(await subSkipSegments()).toEqual(provided);
		});

		test("puts the theme songs found in the video in place of the provider's segments", async () => {
			detections.set(skipDetectionKey(subUrl), {
				checkedAt: new Date(),
				detection: {
					ending: null,
					opening: {
						end: 187.8,
						start: 98.1,
					},
				},
				songs: 2,
			});

			expect(await subSkipSegments()).toEqual([
				{
					end: 187.8,
					kind: "opening",
					start: 98.1,
				},
				{
					end: 1448,
					kind: "ending",
					start: 1351,
				},
			]);
		});

		test("gives no opening when its song plays only late in the video", async () => {
			detections.set(skipDetectionKey(subUrl), {
				checkedAt: new Date(),
				detection: {
					ending: null,
					opening: "none",
				},
				songs: 2,
			});

			const segments = await subSkipSegments();
			expect(segments?.map((segment) => segment.kind)).toEqual(["ending"]);
		});

		test("plays with the provider's segments when stored detections cannot be read", async () => {
			const playback = await resolvePlayback(request, options, {
				...dependencies,
				getSkipDetections: () => Promise.reject(new Error("relation does not exist")),
			});

			expect(playback.media.length).toBeGreaterThan(0);
		});

		test("asks for the episode's songs to be looked for, and the next episode's", async () => {
			await subSkipSegments();

			expect(detectionRequests.toSorted()).toEqual([3, 4]);
		});

		test("asks only for the next episode once this one has been looked at", async () => {
			detections.set(skipDetectionKey(subUrl), {
				checkedAt: new Date(),
				detection: {
					ending: null,
					opening: null,
				},
				songs: 2,
			});
			await subSkipSegments();

			expect(detectionRequests).toEqual([4]);
		});
	});

	test("gives no skip segments for a stream whose player reports none", async () => {
		fake.use([
			{
				id: "animeparadise",
				languages: ["sub"],
				locale: "en",
			},
		]);
		fake.offered = [sub()];

		const playback = await resolvePlayback(request, options, dependencies);
		expect(playback.media[0]?.skip_segments).toEqual([]);
	});

	test("hands out proxy URLs a player can fetch as is", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub"],
				locale: "en",
			},
		]);
		fake.offered = [sub()];

		const playback = await resolvePlayback(request, options, dependencies);
		const [version] = playback.media;
		expect(version?.sources.map((source) => source.url)).toEqual([
			`https://sora.example/v1/streams/${encodeURIComponent("token:https://anikoto.example/sub.m3u8")}`,
		]);
		expect(version?.subtitles.map((subtitle) => subtitle.url)).toEqual([
			`https://sora.example/v1/streams/${encodeURIComponent("token:https://anikoto.example/en.vtt")}`,
			`https://sora.example/v1/streams/${encodeURIComponent("token:https://anikoto.example/pt.vtt")}`,
		]);
	});

	test("tries dub and sub in English when no provider says which languages the episode has", async () => {
		fake.use([
			{
				id: "megaplay",
				languages: ["sub", "dub"],
				locale: "en",
			},
		]);

		expect(await fake.versions()).toEqual(["dub/en@megaplay", "sub/en@megaplay"]);
	});

	test("leaves out a version no provider can stream right now", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub"],
				locale: "en",
			},
		]);
		fake.offered = [dub(), sub()];

		expect(await fake.versions()).toEqual(["sub/en@anikoto"]);
		expect(resolved.toSorted()).toEqual(["anikoto:3/dub", "anikoto:3/sub"]);
	});

	test("asks for a dub a provider's stored list leaves out, as for Banished from the Hero's Party episode 1", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub"],
				locale: "en",
				streams: ["sub", "dub"],
			},
			{
				id: "megaplay",
				languages: ["sub", "dub"],
				locale: "en",
				streams: ["sub"],
			},
		]);
		fake.offered = [sub()];

		expect(await fake.versions()).toEqual(["dub/en@anikoto", "sub/en@anikoto"]);
	});

	test("asks providers whose list has the version before those whose list leaves it out", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub"],
				locale: "en",
				streams: ["sub", "dub"],
			},
			{
				id: "animeparadise",
				languages: ["sub", "dub"],
				locale: "en",
			},
		]);
		fake.offered = [dub(), sub()];

		expect(await fake.versions()).toEqual(["dub/en@animeparadise", "sub/en@anikoto"]);
		expect(resolved.filter((call) => call.endsWith("/dub"))).toEqual(["animeparadise:3/dub"]);
	});

	test("does not ask providers whose list leaves the version out when one that lists it streams it", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
			},
			{
				id: "animeparadise",
				languages: ["sub"],
				locale: "en",
				streams: ["sub", "dub"],
			},
		]);
		fake.offered = [dub(), sub()];

		expect(await fake.versions()).toEqual(["dub/en@anikoto", "sub/en@anikoto"]);
		expect(resolved.filter((call) => call.endsWith("/dub"))).toEqual(["anikoto:3/dub"]);
	});

	test("asks every provider whose list leaves the version out at once, not in turn", async () => {
		fake.use(
			["anikoto", "animeparadise", "megaplay", "allmanga"].map((id) => ({
				delayMs: 40,
				id,
				languages: ["sub"],
				locale: "en",
			})),
		);
		fake.offered = [sub()];

		const started = performance.now();
		expect(await fake.versions()).toEqual(["sub/en@anikoto"]);
		// In turn, the four dub requests would take 160 ms.
		expect(performance.now() - started).toBeLessThan(120);
		expect(resolved.filter((call) => call.endsWith("/dub"))).toHaveLength(4);
	});

	test("serves an unlisted version from the first provider in priority order, not the fastest", async () => {
		fake.use([
			{
				delayMs: 30,
				id: "anikoto",
				languages: ["sub"],
				locale: "en",
				streams: ["sub", "dub"],
			},
			{
				id: "animeparadise",
				languages: ["sub"],
				locale: "en",
				streams: ["sub", "dub"],
			},
		]);
		fake.offered = [sub()];

		expect(await fake.versions()).toEqual(["dub/en@anikoto", "sub/en@anikoto"]);
	});

	test("asks for dub and sub even when no stored list offers either", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["raw"],
				locale: "en",
				streams: ["raw", "sub", "dub"],
			},
		]);
		fake.offered = [
			{
				language: "raw",
				locale: null,
			},
		];

		expect(await fake.versions()).toEqual(["dub/en@anikoto", "sub/en@anikoto", "raw/null@anikoto"]);
	});

	test("never serves a version from a provider in another locale", async () => {
		fake.use([
			{
				id: "brazilian",
				languages: ["sub", "dub"],
				locale: "pt-BR",
			},
			{
				id: "anikoto",
				languages: ["sub"],
				locale: "en",
			},
		]);
		fake.offered = [dub(), sub()];

		expect(await fake.versions()).toEqual(["sub/en@anikoto"]);
	});

	test("gives a dub no subtitles, since the sub's do not match its audio", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["dub"],
				locale: "en",
			},
		]);
		fake.offered = [dub()];

		const playback = await resolvePlayback(request, options, dependencies);
		expect(playback.media[0]?.subtitles).toEqual([]);
		expect(playback.media[0]?.hardsub).toBe(false);
	});

	test("keeps every subtitle language, English first, named by its tag", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub"],
				locale: "en",
			},
		]);
		fake.offered = [sub()];

		const playback = await resolvePlayback(request, options, dependencies);
		expect(playback.media[0]?.subtitles.map((track) => [track.language, track.label])).toEqual([
			["en", "English"],
			["pt", "Portuguese"],
		]);
	});

	test("prefers a later provider's subtitle tracks to burned-in subtitles", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub"],
				locale: "en",
				noSubtitles: true,
			},
			{
				id: "allmanga",
				languages: ["sub"],
				locale: "en",
			},
		]);
		fake.offered = [sub()];

		expect(await fake.versions()).toEqual(["sub/en@allmanga"]);
		const playback = await resolvePlayback(request, options, dependencies);
		expect(playback.media[0]?.hardsub).toBe(false);
	});

	test("skips a sub whose English subtitles cannot be fetched", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
				unreachableSubtitles: true,
			},
			{
				id: "allmanga",
				languages: ["sub"],
				locale: "en",
			},
		]);
		fake.offered = [dub(), sub()];

		expect(await fake.versions()).toEqual(["dub/en@anikoto", "sub/en@allmanga"]);
	});

	test("skips a provider whose video host cannot be reached", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
				unreachableVideo: true,
			},
			{
				id: "allmanga",
				languages: ["sub", "dub"],
				locale: "en",
			},
		]);
		fake.offered = [dub(), sub()];

		expect(await fake.versions()).toEqual(["dub/en@allmanga", "sub/en@allmanga"]);
	});

	test("passes over a dub whose playlist has no English audio yet", async () => {
		fake.use([
			{
				dubAudio: ["ja"],
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
			},
			{
				dubAudio: ["en"],
				id: "allmanga",
				languages: ["sub", "dub"],
				locale: "en",
			},
		]);
		fake.offered = [dub(), sub()];

		expect(await fake.versions()).toEqual(["dub/en@allmanga", "sub/en@anikoto"]);
	});

	test("offers no dub when no provider's dub has English audio", async () => {
		fake.use([
			{
				dubAudio: ["ja"],
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
			},
		]);
		fake.offered = [dub(), sub()];

		expect(await fake.versions()).toEqual(["sub/en@anikoto"]);
	});

	test("plays a dub sharing the sub's playlist with English audio, probing the playlist once, as for Overgeared episode 8", async () => {
		fake.use([
			{
				dubAudio: ["ja", "en", "ar"],
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
				sharedPlaylist: true,
			},
		]);
		fake.offered = [dub(), sub()];

		const playback = await resolvePlayback(request, options, dependencies);

		expect(
			playback.media.map((version) => [version.audio, version.sources.map((source) => source.url)]),
		).toEqual([
			[
				"dub",
				[
					`https://sora.example/v1/streams/${encodeURIComponent("token:https://anikoto.example/master.m3u8~en")}`,
				],
			],
			[
				"sub",
				[
					`https://sora.example/v1/streams/${encodeURIComponent("token:https://anikoto.example/master.m3u8")}`,
				],
			],
		]);
		expect(read).toEqual(["https://anikoto.example/master.m3u8"]);
	});

	test("reads a playlist once for the probe, the warm-up, aligning the dub, and checking skip segments", async () => {
		fake.use([
			{
				dubAudio: ["ja", "en"],
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
				sharedPlaylist: true,
			},
		]);
		fake.offered = [dub(), sub()];
		const warmed = Promise.withResolvers<undefined>();

		await resolvePlayback(request, options, {
			...dependencies,
			streamTimeline: async (url, headers, readPlaylist) => {
				await defined(readPlaylist)(url, headers);

				return {
					duration: null,
					starts: [],
				};
			},
			warmStream: async (url, headers, readPlaylist) => {
				await defined(readPlaylist)(url, headers);
				warmed.resolve(undefined);
			},
		});
		await warmed.promise;

		expect(read).toEqual(["https://anikoto.example/master.m3u8"]);
	});

	test("reads a playlist again after a read of it failed", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub"],
				locale: "en",
			},
		]);
		fake.offered = [sub()];
		let failures = 1;

		const playback = await resolvePlayback(request, options, {
			...dependencies,
			readPlaylist: (url) => {
				read.push(url);

				if (failures > 0) {
					failures -= 1;

					return Promise.reject(new StreamUpstreamError("Upstream throttles", 429));
				}

				return Promise.resolve({
					content: master([]),
					url,
				});
			},
			streamTimeline: async (url, headers, readPlaylist) => {
				await defined(readPlaylist)(url, headers);

				return {
					duration: null,
					starts: [],
				};
			},
		});

		expect(playback.media.map((version) => version.audio)).toEqual(["sub"]);
		expect(read).toEqual(["https://anikoto.example/sub.m3u8", "https://anikoto.example/sub.m3u8"]);
	});

	test("gives a dub the sub's subtitles, retimed to the dub's encode", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
			},
		]);
		fake.offered = [dub(), sub()];
		const subTimeline = new Encode(1).boundaries;
		timelines.set("https://anikoto.example/sub.m3u8", subTimeline);
		timelines.set(
			"https://anikoto.example/dub.m3u8",
			subTimeline.map((time) => time + 2),
		);

		const playback = await resolvePlayback(request, options, dependencies);
		const [dubbed] = playback.media;
		expect(dubbed?.audio).toBe("dub");
		expect(dubbed?.subtitles.map((track) => decodeURIComponent(track.url))).toEqual([
			'https://sora.example/v1/streams/token:https://anikoto.example/en.vtt@[{"from":0,"offset":2}]',
		]);
	});

	test("adds the dub's own captions, shown from the start, and signs, but not its dialogue, to the sub's retimed dialogue", async () => {
		fake.use([
			{
				extraSubtitles: {
					dub: [
						"English (English Closed Captions [CR])",
						"English (English Signs [CR])",
						"English (AI)",
					],
				},
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
			},
		]);
		fake.offered = [dub(), sub()];
		const subTimeline = new Encode(1).boundaries;
		timelines.set("https://anikoto.example/sub.m3u8", subTimeline);
		timelines.set(
			"https://anikoto.example/dub.m3u8",
			subTimeline.map((time) => time + 2),
		);

		const playback = await resolvePlayback(request, options, dependencies);
		const [dubbed, subbed] = playback.media;
		expect(dubbed?.subtitles.map((track) => [track.label, track.kind, track.default])).toEqual([
			["English (CC)", "captions", true],
			["English", null, false],
			["English (Signs)", "signs", false],
		]);
		expect(subbed?.subtitles.map((track) => [track.label, track.default])).toEqual([
			["English", true],
			["Portuguese", false],
		]);
	});

	test("gives a dub no subtitles when its encode does not align with the sub's", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
			},
		]);
		fake.offered = [dub(), sub()];
		timelines.set("https://anikoto.example/sub.m3u8", new Encode(1).boundaries);
		timelines.set("https://anikoto.example/dub.m3u8", new Encode(2).boundaries);

		const playback = await resolvePlayback(request, options, dependencies);
		expect(playback.media[0]?.subtitles).toEqual([]);
	});

	test("times a dub's subtitles to its speech once it was listened to, even when its encode does not align with the sub's", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
			},
		]);
		fake.offered = [dub(), sub()];
		timelines.set("https://anikoto.example/sub.m3u8", new Encode(1).boundaries);
		timelines.set("https://anikoto.example/dub.m3u8", new Encode(2).boundaries);

		const key = refinementKey(
			"https://anikoto.example/sub.m3u8",
			"https://anikoto.example/dub.m3u8",
		);

		refinements.set(key, {
			attemptedAt: new Date(),
			refinement: {
				anchors: [],
				shifts: [
					{
						from: 0,
						offset: 0.5,
					},
				],
			},
		});

		const playback = await resolvePlayback(request, options, dependencies);
		expect(playback.media[0]?.subtitles.map((track) => decodeURIComponent(track.url))).toEqual([
			`https://sora.example/v1/streams/token:https://anikoto.example/en.vtt@[{"from":0,"offset":0.5}]#${key}`,
		]);
	});

	test("serves burned-in subtitles marked hardsub when no provider has tracks", async () => {
		fake.use([
			{
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
				noSubtitles: true,
			},
		]);
		fake.offered = [dub(), sub()];

		const playback = await resolvePlayback(request, options, dependencies);
		expect(
			playback.media.map((version) => [
				version.audio,
				version.provider,
				version.hardsub,
				version.subtitles.length,
			]),
		).toEqual([
			["dub", "anikoto", false, 0],
			["sub", "anikoto", true, 0],
		]);
	});

	test("gives a dub its own captions, shown from the start, and signs when the sub's subtitles are burned in, as for As a Reincarnated Aristocrat episode 1", async () => {
		fake.use([
			{
				extraSubtitles: {
					dub: ["English (English Signs)", "English (English cc)"],
				},
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
				noSubtitles: true,
			},
		]);
		fake.offered = [dub(), sub()];

		const playback = await resolvePlayback(request, options, dependencies);
		expect(
			playback.media.map((version) => [
				version.audio,
				version.hardsub,
				version.subtitles.map((track) => [track.label, track.default]),
			]),
		).toEqual([
			[
				"dub",
				false,
				[
					["English (CC)", true],
					["English (Signs)", false],
				],
			],
			["sub", true, []],
		]);
	});

	test("serves raw from an English provider and reports no locale", async () => {
		fake.use([
			{
				id: "brazilian",
				languages: ["raw"],
				locale: "pt-BR",
			},
			{
				id: "allmanga",
				languages: ["raw"],
				locale: "en",
			},
		]);
		fake.offered = [
			{
				language: "raw",
				locale: null,
			},
		];

		expect(await fake.versions()).toEqual(["raw/null@allmanga"]);
	});

	test("falls through a failing provider to the next in the same locale", async () => {
		fake.use([
			{
				fails: true,
				id: "anikoto",
				languages: ["dub"],
				locale: "en",
			},
			{
				id: "allmanga",
				languages: ["dub"],
				locale: "en",
			},
		]);
		fake.offered = [dub()];

		expect(await fake.versions()).toEqual(["dub/en@allmanga"]);
	});

	test("reports playback unavailable when providers list the episode but none can stream it", async () => {
		fake.use([
			{
				fails: true,
				id: "anikoto",
				languages: ["sub", "dub"],
				locale: "en",
			},
		]);
		fake.offered = [dub(), sub()];

		await expect(resolvePlayback(request, options, dependencies)).rejects.toBeInstanceOf(
			PlaybackUnavailableError,
		);
	});

	test("reports the episode missing when no provider in a wanted locale lists it", async () => {
		fake.use([
			{
				id: "brazilian",
				languages: ["dub"],
				locale: "pt-BR",
			},
		]);

		await expect(resolvePlayback(request, options, dependencies)).rejects.toBeInstanceOf(
			EpisodeNotFoundError,
		);
	});
});

describe("resolvePlayback deadline", () => {
	test("serves the versions that answered and gives up on the one that hangs", async () => {
		fake.use([
			{
				delayMs: 0,
				id: "anikoto",
				languages: ["sub"],
				locale: "en",
			},
			{
				delayMs: 400,
				id: "slow",
				languages: ["dub"],
				locale: "en",
			},
		]);
		fake.offered = [sub(), dub()];

		const playback = await resolvePlayback(
			request,
			{
				...options,
				deadlineMs: 100,
			},
			dependencies,
		);

		expect(playback.media.map((version) => version.audio)).toEqual(["sub"]);
	});

	test("says playback is unavailable, not that the episode is missing, when nothing answers", async () => {
		fake.use([
			{
				delayMs: 400,
				id: "slow",
				languages: ["sub", "dub"],
				locale: "en",
			},
		]);
		fake.offered = [sub(), dub()];

		const failure = await resolvePlayback(
			request,
			{
				...options,
				deadlineMs: 100,
			},
			dependencies,
		).catch((error: Error) => error);

		expect(failure).toBeInstanceOf(PlaybackUnavailableError);

		if (!(failure instanceof PlaybackUnavailableError)) {
			throw new TypeError("Resolving must fail as unavailable");
		}

		expect(failure.attempts[0]?.reason).toContain("no answer within");
	});
});
