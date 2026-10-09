import { randomUUID } from "node:crypto";

import { attempt } from "@sora/shared";
import { z } from "zod";

import { UpstreamUnavailableError } from "../errors";
import { day, hour } from "../time";
import { tmdb } from "./client";

/** TMDB sends missing dates and text as `""` or `null`; both become `null`. */
const OptionalText = z
	.string()
	.nullish()
	.transform((value) => (value ? value : null));

const ShowSearchSchema = z.object({
	results: z.array(
		z.object({
			id: z.number().int(),
			name: z.string(),
			original_name: z.string(),
			first_air_date: OptionalText,
			popularity: z.number(),
		}),
	),
});

const MovieSearchSchema = z.object({
	results: z.array(
		z.object({
			id: z.number().int(),
			title: z.string(),
			original_title: z.string(),
			release_date: OptionalText,
			popularity: z.number(),
		}),
	),
});

const EpisodeSchema = z.object({
	id: z.number().int(),
	season_number: z.number().int(),
	episode_number: z.number().int(),
	name: OptionalText,
	overview: OptionalText,
	air_date: OptionalText,
	runtime: z
		.number()
		.nullish()
		.transform((value) => value ?? null),
	still_path: OptionalText,
});

const EpisodeGroupSchema = z.object({
	groups: z.array(
		z.object({
			name: z.string(),
			order: z.number().int(),
			episodes: z.array(EpisodeSchema.extend({ order: z.number().int() })),
		}),
	),
});

/** Named arcs or release parts, keeping each episode's canonical TMDB identity. */
export type TmdbEpisodeGroup = z.infer<typeof EpisodeGroupSchema>["groups"][number];

const EpisodeGroupsSchema = z.object({
	results: z.array(
		z.object({
			id: z.string(),
			type: z.number().int(),
		}),
	),
});

const SeasonSchema = z.object({
	episodes: z.array(EpisodeSchema),
});

const EpisodeChangesSchema = z.object({
	changes: z.array(
		z.object({
			key: z.string(),
			items: z.array(
				z.object({
					action: z.string(),
					/** `YYYY-MM-DD HH:MM:SS UTC`. */
					time: z.string(),
					iso_639_1: OptionalText,
					// A deletion has no value, an addition no original one.
					value: z.unknown().optional(),
					original_value: z.unknown().optional(),
				}),
			),
		}),
	),
});

const ChangedImageSchema = z.object({
	backdrop: z.object({
		file_path: z.string(),
	}),
});

const ShowFields = {
	id: z.number().int(),
	name: z.string(),
	original_name: z.string(),
	overview: OptionalText,
	poster_path: OptionalText,
	backdrop_path: OptionalText,
	first_air_date: OptionalText,
	seasons: z.array(
		z.object({
			season_number: z.number().int(),
			name: OptionalText,
			overview: OptionalText,
			poster_path: OptionalText,
			episode_count: z
				.number()
				.int()
				.nullish()
				.transform((value) => value ?? 0),
		}),
	),
};

const MovieSchema = z.object({
	id: z.number().int(),
	title: z.string(),
	original_title: z.string(),
	overview: OptionalText,
	poster_path: OptionalText,
	backdrop_path: OptionalText,
	release_date: OptionalText,
	// An unreleased film's runtime is 0 until TMDB knows it.
	runtime: z
		.number()
		.nullish()
		.transform((value) => value || null),
	belongs_to_collection: z
		.object({
			id: z.number().int(),
		})
		.nullish()
		.transform((value) => value ?? null),
});

const CollectionSchema = z.object({
	parts: z.array(
		z.object({
			id: z.number().int(),
			title: z.string(),
			original_title: z.string(),
			release_date: OptionalText,
			popularity: z.number(),
		}),
	),
});

const ImagesSchema = z.object({
	logos: z.array(
		z.object({
			file_path: z.string(),
			iso_639_1: z.string().nullish(),
			vote_average: z.number(),
		}),
	),
});

const ImageSchema = z.object({
	file_path: z.string(),
	width: z.number().int(),
	height: z.number().int(),
	iso_639_1: OptionalText,
	vote_average: z.number(),
	vote_count: z.number().int(),
});

const AllImagesSchema = z.object({
	backdrops: z.array(ImageSchema).default([]),
	posters: z.array(ImageSchema).default([]),
	logos: z.array(ImageSchema).default([]),
});

/** One image of a show, film, or season, in its original size. */
export type TmdbImage = z.infer<typeof ImageSchema>;

/** Every backdrop, poster, and logo of a show or film. */
export type TmdbImages = z.infer<typeof AllImagesSchema>;

/** One TV show found by {@link searchShows}. */
export type TmdbShowResult = z.infer<typeof ShowSearchSchema>["results"][number];

/** One movie found by {@link searchMovies}. */
export type TmdbMovieResult = z.infer<typeof MovieSearchSchema>["results"][number];

/** One TMDB episode. Dates are `YYYY-MM-DD`. */
export type TmdbEpisode = z.infer<typeof EpisodeSchema>;

/** A TMDB movie's details. */
export type TmdbMovie = z.infer<typeof MovieSchema>;

/** A TMDB show with every episode of every season, including specials (season 0). */
export interface TmdbShow {
	id: number;
	name: string;
	originalName: string;
	overview: string | null;
	posterPath: string | null;
	backdropPath: string | null;
	firstAirDate: string | null;
	/** Every season TMDB lists, including specials (season 0). */
	seasons: TmdbSeason[];
	/** Every episode, ordered by season and then episode number. */
	episodes: TmdbEpisode[];
}

/** A season's own name, synopsis, and artwork, such as "Mugen Train Arc". */
interface TmdbSeason {
	seasonNumber: number;
	name: string | null;
	overview: string | null;
	posterPath: string | null;
}

/** TMDB caps `append_to_response` at 20 sub-requests. */
const seasonsPerRequest = 20;

/** Titles and air dates change rarely; a stored search is served for a day. */
const searchLifetimeMs = day;

/** Show structure is refreshed often enough to pick up newly listed episodes. */
const showLifetimeMs = 12 * hour;

/** The longest span TMDB serves a change log for. */
const changeLogSpanMs = 14 * day;

/**
 * How long after its air date an episode's missing details are read from its
 * change log: as long as one request's span reaches, counted from the day
 * before the air date. Most are written within hours of the broadcast, the
 * rest over the following days.
 */
export const editsWindowMs = changeLogSpanMs - 2 * day;

/** The title TMDB gives an episode nobody has named. */
const unnamedEpisode = /^episode \d+$/i;

/** Searches TMDB TV shows by title. Returns the first page, best matches first. */
export async function searchShows(query: string): Promise<TmdbShowResult[]> {
	const result = await tmdb(
		"/search/tv",
		{
			query,
			include_adult: "false",
			language: "en-US",
		},
		ShowSearchSchema,
		{
			maxAgeMs: searchLifetimeMs,
		},
	);

	return result?.results ?? [];
}

/**
 * Loads a show's alternative episode arrangements through TMDB's episode
 * group API. Group order never replaces canonical season/episode numbers.
 * All arrangements are checked, since useful anime parts can be classified
 * as air order, digital releases, story arcs, or TV order.
 */
export async function getShowEpisodeGroups(showId: number): Promise<TmdbEpisodeGroup[][]> {
	const listed = await tmdb(`/tv/${showId}/episode_groups`, {}, EpisodeGroupsSchema, {
		maxAgeMs: showLifetimeMs,
	});
	const details = await Promise.all(
		(listed?.results ?? []).map(({ id }) =>
			tmdb(`/tv/episode_group/${id}`, { language: "en-US" }, EpisodeGroupSchema, {
				maxAgeMs: showLifetimeMs,
			}),
		),
	);
	return details.flatMap((detail) =>
		detail
			? [
					[...detail.groups]
						.sort((left, right) => left.order - right.order)
						.map((group) => ({
							...group,
							episodes: [...group.episodes].sort((left, right) => left.order - right.order),
						})),
				]
			: [],
	);
}

/** Searches TMDB movies by title. Returns the first page, best matches first. */
export async function searchMovies(query: string): Promise<TmdbMovieResult[]> {
	const result = await tmdb(
		"/search/movie",
		{
			query,
			include_adult: "false",
			language: "en-US",
		},
		MovieSearchSchema,
		{
			maxAgeMs: searchLifetimeMs,
		},
	);

	return result?.results ?? [];
}

/**
 * Loads a TMDB show with all of its episodes.
 *
 * Seasons are fetched through `append_to_response`, so a show with fewer
 * than 20 seasons costs one request. TMDB silently omits seasons that do not
 * exist, which lets the first request ask for seasons 0–19 blind.
 *
 * TMDB keeps what it has served of a show, season, or episode for up to eight
 * hours, whatever the request's parameters, so details written since are
 * missing from it. A season is kept apart from the show it is appended to:
 * the show can count a new season's episodes while the season still has
 * none, as on the day it premieres. The episodes it counts and the season
 * lacks are then loaded one by one (see {@link missingEpisodes}), which
 * costs nothing while the two agree. An episode that aired lately and lacks a title, overview,
 * or still takes them from its change log (see {@link withEdits}), as it was
 * last stored: the scheduler's `refreshEpisodeDetails` keeps the change logs
 * of the episodes worth asking about current, and a show read here costs no
 * request for one already stored. Every reader of a show gets the details
 * this way, so a layout stores what the scheduler found.
 *
 * @returns The show, or `null` when TMDB does not know the ID.
 */
export async function getShow(
	showId: number,
	options: {
		/** How old a stored response may be; by default {@link showLifetimeMs}. */
		maxAgeMs?: number;
	} = {},
): Promise<TmdbShow | null> {
	const episodes: TmdbEpisode[] = [];
	let details: z.infer<ReturnType<typeof showPageSchema>> | null = null;

	for (let firstSeason = 0; ; firstSeason += seasonsPerRequest) {
		const seasons = Array.from(
			{
				length: seasonsPerRequest,
			},
			(_, index) => firstSeason + index,
		);
		const page = await tmdb(
			`/tv/${showId}`,
			{
				append_to_response: seasons.map((season) => `season/${season}`).join(","),
				language: "en-US",
			},
			showPageSchema(seasons),
			{
				maxAgeMs: options.maxAgeMs ?? showLifetimeMs,
			},
		);

		if (!page) {
			return null;
		}

		details ??= page;
		for (const season of seasons) {
			const listed = page[`season/${season}`]?.episodes ?? [];
			episodes.push(
				...listed,
				...(await missingEpisodes(showId, page.seasons, season, listed, {
					maxAgeMs: options.maxAgeMs ?? showLifetimeMs,
				})),
			);
		}

		const lastSeason = Math.max(...page.seasons.map((season) => season.season_number));
		if (lastSeason < firstSeason + seasonsPerRequest) {
			break;
		}
	}

	episodes.sort(
		(left, right) =>
			left.season_number - right.season_number || left.episode_number - right.episode_number,
	);

	return {
		id: details.id,
		name: details.name,
		originalName: details.original_name,
		overview: details.overview,
		posterPath: details.poster_path,
		backdropPath: details.backdrop_path,
		firstAirDate: details.first_air_date,
		seasons: details.seasons.map((season) => ({
			seasonNumber: season.season_number,
			name: season.name,
			overview: season.overview,
			posterPath: season.poster_path,
		})),
		episodes: await Promise.all(
			episodes.map((episode) =>
				withEdits(episode, {
					maxAgeMs: changeLogSpanMs,
				}),
			),
		),
	};
}

/**
 * The episodes a show counts for `seasonNumber` past those its appended
 * season lists, each loaded on its own, since TMDB keeps a single episode
 * apart from its season too. They are taken to follow the last one listed,
 * or to start at 1, as TMDB numbers a season's episodes; the first TMDB does
 * not know ends them, so a season numbered otherwise costs one request.
 */
async function missingEpisodes(
	showId: number,
	seasons: readonly {
		season_number: number;
		episode_count: number;
	}[],
	seasonNumber: number,
	listed: readonly TmdbEpisode[],
	options: {
		maxAgeMs: number;
	},
): Promise<TmdbEpisode[]> {
	const counted =
		seasons.find((season) => season.season_number === seasonNumber)?.episode_count ?? 0;
	const after = Math.max(0, ...listed.map((episode) => episode.episode_number));
	const found: TmdbEpisode[] = [];
	for (let number = after + 1; listed.length + found.length < counted; number += 1) {
		const episode = await tmdb(
			`/tv/${showId}/season/${seasonNumber}/episode/${number}`,
			{
				language: "en-US",
			},
			EpisodeSchema,
			options,
		);
		if (!episode) {
			break;
		}

		found.push(episode);
	}

	return found;
}

/**
 * Fills in the title, overview, runtime, and still an episode lacks from the
 * English edits in its change log, when it aired within {@link editsWindowMs}.
 * TMDB's air date is in the airing country's calendar, which can be a day
 * ahead of UTC.
 *
 * TMDB keeps a change log for ten minutes, where it keeps the episode itself
 * for hours. The log is asked for from the day before the air date on, for
 * as long as TMDB serves one: the same request for as long as the episode is
 * read, so one stored copy serves every reader, and `maxAgeMs` alone decides
 * when TMDB is asked again. The range may end in the future, and has to end
 * after today for today's edits to be in it.
 *
 * A change log TMDB fails to serve leaves the episode as it is: the show is
 * still worth having, and the next read asks again.
 */
export async function withEdits(
	episode: TmdbEpisode,
	options: {
		/** How old a stored copy of the change log may be. */
		maxAgeMs: number;
	},
): Promise<TmdbEpisode> {
	const isUnnamed = episode.name === null || unnamedEpisode.test(episode.name);
	const since = new Date(Date.now() - editsWindowMs).toISOString().slice(0, 10);
	const until = new Date(Date.now() + day).toISOString().slice(0, 10);
	if (
		(!isUnnamed && episode.overview !== null && episode.still_path !== null) ||
		episode.air_date === null ||
		episode.air_date < since ||
		episode.air_date > until
	) {
		return episode;
	}

	const from = Date.parse(`${episode.air_date}T00:00:00Z`) - day;
	const { data, error } = await attempt(
		tmdb(
			`/tv/episode/${episode.id}/changes`,
			{
				start_date: new Date(from).toISOString().slice(0, 10),
				end_date: new Date(from + changeLogSpanMs).toISOString().slice(0, 10),
			},
			EpisodeChangesSchema,
			options,
		),
		UpstreamUnavailableError,
	);
	if (error || !data) {
		return episode;
	}

	const edits = (key: string) =>
		(data.changes.find((change) => change.key === key)?.items ?? []).toSorted((left, right) =>
			left.time.localeCompare(right.time),
		);
	const text = (key: string) => {
		const value = edits(key).findLast((edit) => edit.iso_639_1 === "en")?.value;
		return typeof value === "string" && value !== "" ? value : null;
	};
	// A runtime is filed under the language of whoever wrote it.
	const runtime = edits("runtime").at(-1)?.value;
	const stills = new Set<string>();
	for (const edit of edits("images")) {
		const added = ChangedImageSchema.safeParse(edit.value);
		const removed = ChangedImageSchema.safeParse(edit.original_value);
		if (edit.action === "deleted" && removed.success) {
			stills.delete(removed.data.backdrop.file_path);
		} else if (added.success) {
			stills.add(added.data.backdrop.file_path);
		}
	}

	return {
		...episode,
		name: (isUnnamed ? text("name") : null) ?? episode.name,
		overview: episode.overview ?? text("overview"),
		runtime: episode.runtime ?? (typeof runtime === "number" && runtime > 0 ? runtime : null),
		still_path: episode.still_path ?? [...stills].at(0) ?? null,
	};
}

/**
 * Loads a TMDB movie's details.
 *
 * @returns The movie, or `null` when TMDB does not know the ID.
 */
export function getMovie(movieId: number): Promise<TmdbMovie | null> {
	return tmdb(
		`/movie/${movieId}`,
		{
			language: "en-US",
		},
		MovieSchema,
		{
			maxAgeMs: day,
		},
	);
}

/**
 * Loads the films of a TMDB collection, such as a franchise's film series.
 *
 * @returns The collection's films in TMDB's order, or `[]` when TMDB does
 *   not know the ID.
 */
export async function getCollectionParts(collectionId: number): Promise<TmdbMovieResult[]> {
	const collection = await tmdb(
		`/collection/${collectionId}`,
		{
			language: "en-US",
		},
		CollectionSchema,
		{
			maxAgeMs: day,
		},
	);

	return collection?.parts ?? [];
}

/**
 * Finds the logo (the title artwork drawn over a backdrop) of a show or film.
 *
 * English logos are preferred, then logos without text language, each by
 * TMDB's vote average. Logos in other languages are never used, since a
 * Japanese logo on an English page reads as a mistake.
 *
 * @returns The logo's image path, or `null` when TMDB has none.
 */
export async function getLogoPath(mediaType: "tv" | "movie", id: number): Promise<string | null> {
	const images = await tmdb(
		`/${mediaType}/${id}/images`,
		{
			include_image_language: "en,null",
		},
		ImagesSchema,
		{
			maxAgeMs: day,
		},
	);

	const logos = (images?.logos ?? [])
		.filter((logo) => logo.iso_639_1 === "en" || !logo.iso_639_1)
		.sort(
			(left, right) =>
				Number(right.iso_639_1 === "en") - Number(left.iso_639_1 === "en") ||
				right.vote_average - left.vote_average,
		);

	return logos[0]?.file_path ?? null;
}

/**
 * Loads every backdrop, poster, and logo of a show or film, in every
 * language: without `include_image_language`, TMDB filters none out.
 *
 * With `maxAgeMs: 0`, TMDB's own cache is bypassed too; see {@link loadImages}.
 *
 * @returns The images, or `null` when TMDB does not know the ID.
 */
export function getImages(
	mediaType: "tv" | "movie",
	id: number,
	options: {
		/** How old a stored response may be; a day by default. */
		maxAgeMs?: number;
	} = {},
): Promise<TmdbImages | null> {
	return loadImages(`/${mediaType}/${id}/images`, options.maxAgeMs ?? day);
}

/**
 * Loads a show season's posters, in every language. Empty when TMDB does not
 * know the season. With `maxAgeMs: 0`, TMDB's own cache is bypassed too.
 */
export async function getSeasonPosters(
	showId: number,
	seasonNumber: number,
	options: {
		/** How old a stored response may be; a day by default. */
		maxAgeMs?: number;
	} = {},
): Promise<TmdbImage[]> {
	const images = await loadImages(
		`/tv/${showId}/season/${seasonNumber}/images`,
		options.maxAgeMs ?? day,
	);
	return images?.posters ?? [];
}

/** TMDB honours this many languages of an `include_image_language` list, counting `null`. */
const languagesPerImageRequest = 5;

/**
 * Loads an `/images` resource. With `maxAgeMs: 0` it is asked for again past
 * TMDB's own cache, which serves the same answer for hours and ignores
 * parameters it does not know, but not a language list it has not seen: each
 * language the cached answer has is asked for again, a few per request with
 * `null` and a nonce. An image in a language the title had none in yet is
 * still missed until that cache expires.
 */
async function loadImages(path: string, maxAgeMs: number): Promise<TmdbImages | null> {
	const cached = await tmdb(path, {}, AllImagesSchema, {
		maxAgeMs,
	});
	if (!cached || maxAgeMs > 0) {
		return cached;
	}

	const languages = [
		...new Set(
			[...cached.backdrops, ...cached.posters, ...cached.logos].flatMap(
				(image) => image.iso_639_1 ?? [],
			),
		),
	];
	const perRequest = languagesPerImageRequest - 1;
	const batches = Array.from(
		{
			length: Math.max(1, Math.ceil(languages.length / perRequest)),
		},
		(_, index) => languages.slice(index * perRequest, (index + 1) * perRequest),
	);
	const answers = await Promise.all(
		batches.map((batch) =>
			tmdb(
				path,
				{
					include_image_language: ["null", ...batch, randomUUID()].join(","),
				},
				AllImagesSchema,
				{
					maxAgeMs: 0,
					store: false,
				},
			),
		),
	);

	// Every batch has the textless images; keep each image once.
	const unique = (images: TmdbImage[]) => [
		...new Map(images.map((image) => [image.file_path, image])).values(),
	];
	return {
		backdrops: unique(answers.flatMap((answer) => answer?.backdrops ?? [])),
		posters: unique(answers.flatMap((answer) => answer?.posters ?? [])),
		logos: unique(answers.flatMap((answer) => answer?.logos ?? [])),
	};
}

/** A show's details plus the appended `season/N` objects for the requested seasons. */
function showPageSchema(seasons: readonly number[]) {
	return z.object({
		...ShowFields,
		...Object.fromEntries(seasons.map((season) => [`season/${season}`, SeasonSchema.nullish()])),
	}) as z.ZodObject<
		typeof ShowFields &
			Record<`season/${number}`, z.ZodOptional<z.ZodNullable<typeof SeasonSchema>>>
	>;
}

/**
 * Builds a TMDB image URL.
 *
 * @param size - A TMDB size bucket such as `w780` or `original`.
 */
export function tmdbImageUrl(
	path: string | null,
	size: "w300" | "w500" | "w780" | "w1280" | "original",
) {
	return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}
