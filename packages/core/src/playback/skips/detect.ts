import { attempt, defined, second } from "@sora/shared";

import type { ProviderVideo } from "../providers/provider";
import { mediaPlaylist, readWithRetries } from "../subtitles/audio";
import { fingerprint, locateSong } from "./fingerprint";
import type { Fingerprint, SongMatch } from "./fingerprint";
import { Samples } from "./samples";
import type { SkipDetection } from "./store";
import type { ThemeSong } from "./themes";

/** A song is taken as playing only when this share of it matches; less is a snippet used as background music. */
const wholeSong = 0.8;

/** An opening song that starts this far into an episode is not its opening. */
const lateOpening = 0.7;

/** A song looked for, with its fingerprint. */
export interface ListenedSong {
	kind: ThemeSong["kind"];
	print: Fingerprint;
}

/** Where a song was found in a video. */
export interface FoundSong extends SongMatch {
	kind: ThemeSong["kind"];
	/**
	 * It reaches the edge of the stretch read, inside the video, so more of it
	 * may play past that edge.
	 */
	clipped: boolean;
}

/**
 * The fingerprint of a theme song's audio file.
 *
 * @throws {Error} when the file cannot be fetched or decoded.
 */
export const listenToSong = async (song: ThemeSong): Promise<ListenedSong> => {
	const response = await fetch(song.audioUrl, {
		headers: {
			"User-Agent": "Sora",
		},
		signal: AbortSignal.timeout(60 * second),
	});

	if (!response.ok || !response.body) {
		throw new Error(`AnimeThemes answered ${response.status} for ${song.slug}`);
	}

	return {
		kind: song.kind,
		print: fingerprint(await new Samples(response.body).read()),
	};
};

/** Where a video's segments start and end, in seconds, and the playlist they come from. */
interface Segments {
	initialization: string | null;
	playlistUrl: string;
	segments: {
		start: number;
		end: number;
		url: string;
	}[];
}

/** A video read in stretches, as fingerprints. */
class Stretches {
	readonly #video: ProviderVideo;
	readonly #stream: Segments;

	constructor(video: ProviderVideo, stream: Segments) {
		this.#video = video;
		this.#stream = stream;
	}

	/**
	 * The fingerprint of the video from `from` to `to` seconds, and where it
	 * starts and ends: at the edges of the segments that reach into the stretch.
	 *
	 * @throws {Error} when the stretch has no segments or cannot be read.
	 */
	async read(from: number, to: number) {
		/** Segments fetched at once; hosts that limit requests answer more with 429. */
		const concurrency = 3;

		const stream = this.#stream;
		const { headers } = this.#video;
		const picked = stream.segments.filter((segment) => segment.end > from && segment.start < to);

		if (picked.length === 0) {
			throw new Error("The video has no segments to read");
		}

		const urls = picked.map((segment) => segment.url);

		if (stream.initialization) {
			urls.unshift(stream.initialization);
		}

		const fetching = new Map<number, Promise<Uint8Array>>();

		const fetchSegment = (index: number) => {
			const promise =
				fetching.get(index) ?? readWithRetries(defined(urls[index]), stream.playlistUrl, headers);

			fetching.set(index, promise);

			return promise;
		};

		// Segments are handed to ffmpeg in order, the next few fetched meanwhile.
		let next = 0;

		const inOrder = new ReadableStream<Uint8Array>({
			pull: async (controller) => {
				if (next >= urls.length) {
					controller.close();

					return;
				}

				for (let ahead = next; ahead < Math.min(urls.length, next + concurrency); ahead += 1) {
					// A failed fetch ahead is awaited, and so reported, when its turn comes.
					attempt(fetchSegment(ahead));
				}

				controller.enqueue(await fetchSegment(next));
				fetching.delete(next);
				next += 1;
			},
		});

		return {
			end: picked.at(-1)?.end ?? to,
			print: fingerprint(await new Samples(inOrder).read()),
			start: picked[0]?.start ?? from,
		};
	}
}

/**
 * What the songs found in an episode's video settle (see {@link SkipDetection}):
 *
 * - A song counts only when most of it plays; a snippet is background music.
 * - The opening is the earliest whole opening song before the late part of the
 *   episode; a repeat later on is not. One read whole beats one cut off at the
 *   edge of what was read.
 * - An opening song that plays only late in the episode is no opening to
 *   skip. With no ending song, it is the ending, as first episodes often close
 *   on their opening.
 */
export const judgeSongs = (found: FoundSong[], length: number): SkipDetection => {
	const whole = found
		.filter((song) => song.coverage >= wholeSong)
		.toSorted(
			(left, right) =>
				Number(left.clipped) - Number(right.clipped) || right.coverage - left.coverage,
		);

	const openings = whole.filter((song) => song.kind === "opening");

	const [opening] = openings
		.filter((song) => song.start <= lateOpening * length)
		.toSorted(
			(left, right) => Number(left.clipped) - Number(right.clipped) || left.start - right.start,
		);

	const late = openings.find((song) => song.start > lateOpening * length);
	const ending = whole.find((song) => song.kind === "ending");

	const span = (song: FoundSong | undefined) => {
		if (song) {
			return {
				end: Math.round(song.end * 10) / 10,
				start: Math.round(song.start * 10) / 10,
			};
		}

		return null;
	};

	if (opening || !late) {
		return {
			ending: span(ending),
			opening: span(opening),
		};
	}

	return {
		ending: span(ending ?? late),
		opening: "none",
	};
};

/** Seconds read at the start of a video, where nearly every opening ends. */
const openingStretch = 360;

/** Seconds read at the end of a video, where nearly every ending starts. */
const endingStretch = 330;

/** How far a stretch read later overlaps the one before, so a song across their seam is read whole. */
const seamOverlap = 100;

/**
 * Looks for an episode's theme songs in one of its videos.
 *
 * Only the stretches songs usually play in are read: the first six minutes
 * and the last five and a half. Where a kind's song is not found there, the
 * next stretch towards the middle is read too, and an opening found nowhere
 * yet reads the rest of the middle. The video and its audio are never
 * stored; only where the songs were found is returned.
 *
 * @throws {Error} when the video cannot be read.
 */
export const detectSkipSegments = async (
	video: ProviderVideo,
	songs: ListenedSong[],
): Promise<SkipDetection> => {
	const media = await mediaPlaylist(video.url, video.headers);

	if (/^#EXT-X-KEY:(?!METHOD=NONE)/mu.test(media.text)) {
		throw new Error("The stream is encrypted");
	}

	const segments: Segments["segments"] = [];

	let elapsed = 0;
	let duration = 0;

	for (const line of media.text.split(/\r?\n/u).map((text) => text.trim())) {
		if (line.startsWith("#EXTINF:")) {
			duration = Number(/^#EXTINF:(?<seconds>[\d.]+)/u.exec(line)?.[1] ?? 0);
		} else if (line && !line.startsWith("#")) {
			segments.push({
				end: elapsed + duration,
				start: elapsed,
				url: new URL(line, media.url).toString(),
			});
			elapsed += duration;
		}
	}

	// Fragmented MP4 segments decode only after their initialization section.
	const initialization = /^#EXT-X-MAP:.*URI="(?<uri>[^"]+)"/mu.exec(media.text)?.[1];
	let initializationUrl: string | null = null;

	if (initialization) {
		initializationUrl = new URL(initialization, media.url).toString();
	}

	const stretches = new Stretches(video, {
		initialization: initializationUrl,
		playlistUrl: media.url,
		segments,
	});

	const length = elapsed;
	const found: FoundSong[] = [];

	const search = async (from: number, to: number) => {
		const stretch = await stretches.read(Math.max(0, from), Math.min(length, to));

		for (const song of songs) {
			const match = locateSong(song.print, stretch.print);

			if (match) {
				const start = stretch.start + match.start;
				const end = stretch.start + match.end;
				found.push({
					clipped:
						(stretch.start > 1 && start - stretch.start < 1) ||
						(stretch.end < length - 1 && stretch.end - end < 1),
					coverage: match.coverage,
					end,
					kind: song.kind,
					start,
				});
			}
		}
	};

	// A kind is settled by a whole song read whole: for the opening, one before
	// the late part of the episode, where a repeat would not count.
	const settled = (kind: ThemeSong["kind"]) =>
		!songs.some((song) => song.kind === kind) ||
		found.some(
			(song) =>
				song.kind === kind &&
				song.coverage >= wholeSong &&
				!song.clipped &&
				(kind === "ending" || song.start <= lateOpening * length),
		);

	const middle = {
		from: openingStretch,
		to: length - endingStretch,
	};

	if (middle.to - middle.from < seamOverlap) {
		await search(0, length);

		return judgeSongs(found, length);
	}

	await search(0, openingStretch);
	await search(length - endingStretch, length);

	if (!settled("opening")) {
		await search(openingStretch - seamOverlap, Math.min(middle.to, 2 * openingStretch));
	}

	if (!settled("ending")) {
		await search(
			Math.max(middle.from, length - 2 * endingStretch),
			length - endingStretch + seamOverlap,
		);
	}

	// An opening song can play anywhere in an episode that does not open with
	// it, such as over a finale's climax, and only reading it shows there is
	// no opening to skip.
	if (!settled("opening") && 2 * openingStretch < middle.to) {
		await search(2 * openingStretch - seamOverlap, length - endingStretch + seamOverlap);
	}

	return judgeSongs(found, length);
};
