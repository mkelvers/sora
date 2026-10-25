import { eq } from "drizzle-orm";

import type { MediaRelation } from "../anilist/graphql.generated";
import { toAnimeCard } from "../catalog/models/anime";
import type { AnimeCard, AnimeStatus } from "../catalog/models/anime";
import { fuzzyDate, placeholder, synopsis } from "../catalog/models/text";
import { getAnime, getStoredAnimeCards, mayGainEpisodes } from "../catalog/queries/anime";
import { db } from "../database/client";
import { series } from "../database/schema";
import { AnimeNotFoundError } from "../errors";
import { getLogoPath, getMovie, getShow, tmdbImageUrl } from "../tmdb/resources";
import type { TmdbMovie, TmdbShow } from "../tmdb/resources";
import { franchiseRelations, loadEntries } from "./entries";
import type { FranchiseEntry } from "./entries";
import { getAniKotoEpisodeCount } from "./episodes";
import { mappedEpisodes, resolveMapping } from "./mapping";
import type { EpisodeLink } from "./matching";

/**
 * Identifies the TMDB title an AniList entry was matched to:
 *
 * - `tv:` a TMDB show, which every season of the show is matched to;
 * - `movie:` a TMDB film;
 * - `anilist:` the entry itself, when TMDB does not list it.
 */
export type SeriesKey = `tv:${number}` | `movie:${number}` | `anilist:${number}`;

/**
 * - `tv`: an entry TMDB lists in a show, such as a season or an OVA.
 * - `movie`: an entry TMDB lists as a film.
 * - `standalone`: an entry TMDB does not list.
 */
export type SeriesKind = "tv" | "movie" | "standalone";

/** One episode of a laid-out series. */
export interface SeriesEpisode {
	/** The episode's number in its AniList entry, from 1. */
	number: number;
	title: string | null;
	overview: string | null;
	/** `YYYY-MM-DD`. */
	airDate: string | null;
	runtimeMinutes: number | null;
	stillUrl: string | null;
	/** The TMDB episode this is, when TMDB lists it. */
	tmdb: {
		seasonNumber: number;
		episodeNumber: number;
	} | null;
}

/** An AniList entry laid out as a series from AniList and TMDB, ready to be stored. */
export interface SeriesLayout {
	anilistId: number;
	key: SeriesKey;
	kind: SeriesKind;
	title: string;
	/** TMDB's synopsis where it describes the entry, else AniList's. */
	overview: string | null;
	/** AniList's cover of the entry, which tells one season from another. */
	posterUrl: string | null;
	/** TMDB's backdrop of the show or film, or AniList's banner when TMDB has none. */
	backdropUrl: string | null;
	/** TMDB's English or textless logo; `null` when TMDB has none. */
	logoUrl: string | null;
	/** First air or release date: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`. */
	startDate: string | null;
	status: AnimeStatus | null;
	episodes: SeriesEpisode[];
	/** False when playable compilations use different numbers from AniList's broadcast shorts. */
	useAniListAirings: boolean;
	/** The entries AniList relates the entry to inside its franchise, in AniList's order. */
	related: {
		anilistId: number;
		relation: MediaRelation;
	}[];
	/** The entry's announced upcoming episode. */
	nextAiring: {
		episode: number;
		/** ISO 8601 timestamp. */
		airingAt: string;
	} | null;
	/**
	 * Whether the entry may still gain episodes. The airing scheduler must
	 * then follow it, since its checks are what lay the series out again as
	 * it airs.
	 */
	mayGainEpisodes: boolean;
}

/** A series key's kind and TMDB (or AniList) ID. */
export const parseKey = (key: SeriesKey) => {
	const [kind, id] = key.split(":") as ["tv" | "movie" | "anilist", string];
	return [kind, Number(id)] as const;
};

/**
 * The entry's episodes, numbered as AniList numbers them, each with the
 * details of the TMDB episode it was matched to. A film TMDB lists on its
 * own has no episodes there; its details stand in for its only episode. A
 * special of several episodes that TMDB lists as a film keeps them bare.
 *
 * AniKoto's playable count takes precedence. Without it, use AniList's total,
 * or the episodes aired so far, and never fewer than the TMDB links or one.
 */
export const layoutEpisodes = (
	card: Pick<AnimeCard, "episodes" | "nextEpisode" | "durationMinutes"> & {
		playbackEpisodes?: number | null;
	},
	links: readonly EpisodeLink[],
	show: Pick<TmdbShow, "episodes"> | null,
	movie: Pick<
		TmdbMovie,
		"title" | "overview" | "release_date" | "runtime" | "backdrop_path"
	> | null,
): SeriesEpisode[] => {
	const tmdbEpisodes = new Map(
		(show?.episodes ?? []).map((episode) => [
			`${episode.season_number}:${episode.episode_number}`,
			episode,
		]),
	);
	const linked = new Map(links.map((link) => [link.anilistEpisode, link]));
	const count =
		card.playbackEpisodes ??
		Math.max(
			card.episodes ?? (card.nextEpisode ? card.nextEpisode.number - 1 : links.length),
			...links.map((link) => link.anilistEpisode),
			1,
		);

	return Array.from(
		{
			length: count,
		},
		(_, index) => {
			const number = index + 1;
			const link = linked.get(number);
			const tmdb = link
				? (tmdbEpisodes.get(`${link.seasonNumber}:${link.episodeNumber}`) ?? null)
				: null;
			const film = number === 1 && count === 1 ? movie : null;
			return {
				airDate: tmdb?.air_date ?? film?.release_date ?? null,
				number,
				overview: tmdb?.overview ?? film?.overview ?? null,
				runtimeMinutes: tmdb?.runtime ?? film?.runtime ?? card.durationMinutes,
				stillUrl: tmdbImageUrl(tmdb?.still_path ?? film?.backdrop_path ?? null, "original"),
				title: tmdb?.name ?? film?.title ?? null,
				tmdb: tmdb && {
					episodeNumber: tmdb.episode_number,
					seasonNumber: tmdb.season_number,
				},
			};
		},
	);
};

/**
 * TMDB's synopsis where it describes the entry: a film's own, and a show's
 * for the entry that opens the show. A later season, or a special, has only
 * AniList's, since TMDB's synopsis of a show describes how it begins.
 * Either is cut down to its premise (see {@link synopsis}).
 */
const overviewOf = (
	links: readonly EpisodeLink[],
	show: TmdbShow | null,
	movie: TmdbMovie | null,
) => {
	const opensShow = links.some((link) => link.seasonNumber === 1 && link.episodeNumber === 1);
	const showOverview = opensShow ? show?.overview : null;
	const overview = movie ? movie.overview : showOverview;
	return (overview && synopsis(overview)) || null;
};

const releaseOrder = (entry: FranchiseEntry) => {
	const date = entry.startDate;
	return date?.year
		? date.year * 10_000 + (date.month ?? 0) * 100 + (date.day ?? 0)
		: Number.MAX_SAFE_INTEGER;
};

/** The release a franchise starts with: the earliest prequel of the earliest prequel, and so on. */
const firstRelease = async (entry: FranchiseEntry) => {
	const visited = new Set([entry.id]);
	let current = entry;
	for (let depth = 0; depth < 12; depth += 1) {
		const ids = (current.relations?.edges ?? []).flatMap((edge) =>
			edge?.relationType === "PREQUEL" && edge.node?.type === "ANIME" && !visited.has(edge.node.id)
				? [edge.node.id]
				: [],
		);
		const loadedPrequels = await loadEntries(ids);
		const prequels = [...loadedPrequels.values()];
		const [earliest] = prequels.toSorted(
			(left, right) => releaseOrder(left) - releaseOrder(right) || left.id - right.id,
		);
		if (!earliest) {
			return current;
		}

		visited.add(earliest.id);
		current = earliest;
	}

	return current;
};

/**
 * AniList's synopsis of the entry. One that only names the release, such as
 * `Part 3 of Tensei Shitara Slime Datta Ken 4th Season.`, is swapped for
 * TMDB's synopsis of the entry's season, else for the synopsis of how the
 * story begins: TMDB's of the show, else that of the franchise's first
 * release, found by AniList's prequels.
 */
const anilistOverview = async (
	entry: FranchiseEntry,
	links: readonly EpisodeLink[],
	show: TmdbShow | null,
) => {
	const anime = await getAnime(entry.id);
	const own = anime.description;
	if (own && !placeholder.test(own)) {
		return own;
	}

	const seasonNumber = links.find((link) => link.seasonNumber > 0)?.seasonNumber;
	const season = show?.seasons.find((candidate) => candidate.seasonNumber === seasonNumber);
	if (season?.overview) {
		return synopsis(season.overview);
	}

	const first = await firstRelease(entry);
	const [stored] =
		first.id === entry.id
			? []
			: await db
					.select({
						overview: series.overview,
					})
					.from(series)
					.where(eq(series.anilistId, first.id))
					.limit(1);
	let firstDescription: string | null = null;

	if (first.id !== entry.id) {
		const firstAnime = await getAnime(first.id);

		firstDescription = firstAnime.description;
	}

	const replacement =
		(show?.overview && synopsis(show.overview)) || stored?.overview || firstDescription;

	return (replacement && !placeholder.test(replacement) ? replacement : null) ?? own;
};

/**
 * Lays out one AniList entry as a series.
 *
 * AniList lists each season, cour, film, and special of a franchise as its
 * own entry, and so does Sora: an entry is a series, with the episodes
 * AniList counts for it. The entry is matched to TMDB (see
 * `resolveMapping`) only for what TMDB knows better: the backdrop and logo
 * of the show or film, and each episode's title, synopsis, air date, and
 * still. An entry TMDB does not list keeps AniList's artwork and bare
 * episodes.
 *
 * Reads AniList and TMDB, so only the series store calls it; readers use
 * the stored layout. Matches are stored, so laying out a known entry again
 * mostly reuses them.
 *
 * @throws {AnimeNotFoundError} when the ID is unknown to AniList or
 *   belongs to adult media.
 * @throws {UpstreamUnavailableError} when AniList or TMDB fail.
 */
export const buildSeries = async (anilistId: number): Promise<SeriesLayout> => {
	const loaded = await loadEntries([anilistId]);
	const entry = loaded.get(anilistId);
	if (!entry) {
		throw new AnimeNotFoundError(anilistId);
	}

	const mapping = await resolveMapping(entry);
	const storedCards = await getStoredAnimeCards([anilistId]);
	const card = {
		...(storedCards.get(anilistId) ?? toAnimeCard(entry)),
		playbackEpisodes: await getAniKotoEpisodeCount(anilistId),
	};
	const links = mappedEpisodes(mapping);
	const show =
		mapping.mediaType === "tv" && mapping.tmdbId !== null ? await getShow(mapping.tmdbId) : null;
	const movie =
		mapping.mediaType === "movie" && mapping.tmdbId !== null
			? await getMovie(mapping.tmdbId)
			: null;
	// An entry whose TMDB title cannot be read is laid out as one TMDB does not list.
	const fallbackKey: SeriesKey = movie ? `movie:${movie.id}` : `anilist:${anilistId}`;
	const key: SeriesKey = show ? `tv:${show.id}` : fallbackKey;
	const [kind, tmdbId] = parseKey(key);
	const episodes = layoutEpisodes(card, links, show, movie);
	// A film's synopsis describes the film, not a special of several episodes.
	const film = episodes.length === 1 ? movie : null;

	return {
		anilistId,
		backdropUrl:
			tmdbImageUrl(show?.backdropPath ?? movie?.backdrop_path ?? null, "original") ??
			card.bannerUrl,
		episodes,
		key,
		kind: kind === "anilist" ? "standalone" : kind,
		logoUrl: kind === "anilist" ? null : tmdbImageUrl(await getLogoPath(kind, tmdbId), "w500"),
		mayGainEpisodes: mayGainEpisodes(entry, new Date()),
		nextAiring: card.nextEpisode && {
			airingAt: card.nextEpisode.airingAt,
			episode: card.nextEpisode.number,
		},
		overview: overviewOf(links, show, film) ?? (await anilistOverview(entry, links, show)),
		posterUrl: tmdbImageUrl(movie?.poster_path ?? null, "w780") ?? card.coverUrl,
		related: (entry.relations?.edges ?? []).flatMap((edge) =>
			edge?.node?.type === "ANIME" && edge.relationType && franchiseRelations.has(edge.relationType)
				? [
						{
							anilistId: edge.node.id,
							relation: edge.relationType,
						},
					]
				: [],
		),
		startDate: entry.startDate ? fuzzyDate(entry.startDate) : null,
		status: card.status,
		title: card.title.display,
		useAniListAirings: mapping.method !== "compilation",
	};
};
