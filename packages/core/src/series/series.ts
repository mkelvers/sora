import { z } from "zod";

import type { MediaRelation } from "../anilist/graphql.generated";
import { toCard } from "../catalog/models/anime";
import type { AnimeCard, AnimeStatus } from "../catalog/models/anime";
import { fuzzyDate } from "../catalog/models/text";
import { mayGainEpisodes, catalog } from "../catalog/queries/anime";
import { UnknownAnimeError } from "../errors";
import { getLogoPath, imageUrl } from "../tmdb/resources";
import type { TmdbMovie, TmdbShow } from "../tmdb/resources";
import { franchiseRelations, loadByIds } from "./entries";
import { playableCount } from "./episodes";
import { LaidOutEpisode } from "./laid-out-episode";
import { Mapper } from "./mapper";
import { mappedEpisodes } from "./mapping";
import { MatchedTitle } from "./matched-title";
import type { EpisodeLink } from "./matching";
import { Overview } from "./overview";

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

/** Parses a persisted series key, rejecting unknown kinds and invalid IDs. */
export const parseKey = (key: string) =>
	z
		.tuple([z.enum(["tv", "movie", "anilist"]), z.coerce.number().int().positive()])
		.parse(key.split(":"));

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
	let aired = links.length;

	if (card.nextEpisode) {
		aired = card.nextEpisode.number - 1;
	}

	const count =
		card.playbackEpisodes ??
		Math.max(card.episodes ?? aired, ...links.map((link) => link.anilistEpisode), 1);

	return Array.from(
		{
			length: count,
		},
		(_, index) => {
			const number = index + 1;
			const link = linked.get(number);

			let tmdb: TmdbShow["episodes"][number] | null = null;

			if (link) {
				tmdb = tmdbEpisodes.get(`${link.seasonNumber}:${link.episodeNumber}`) ?? null;
			}

			let film: typeof movie = null;

			if (number === 1 && count === 1) {
				film = movie;
			}

			return new LaidOutEpisode(number, tmdb, film, card.durationMinutes).episode;
		},
	);
};

/**
 * Lays out one AniList entry as a series.
 *
 * AniList lists each season, cour, film, and special of a franchise as its
 * own entry, and so does Sora: an entry is a series, with the episodes
 * AniList counts for it. The entry is matched to TMDB (see
 * `Mapper.resolve`) only for what TMDB knows better: the backdrop and logo
 * of the show or film, and each episode's title, synopsis, air date, and
 * still. An entry TMDB does not list keeps AniList's artwork and bare
 * episodes.
 *
 * Reads AniList and TMDB, so only the series store calls it; readers use
 * the stored layout. Matches are stored, so laying out a known entry again
 * mostly reuses them.
 *
 * @throws {UnknownAnimeError} when the ID is unknown to AniList or
 *   belongs to adult media.
 * @throws {UpstreamUnavailableError} when AniList or TMDB fail.
 */
export const layOut = async (anilistId: number): Promise<SeriesLayout> => {
	const loaded = await loadByIds([anilistId]);
	const entry = loaded.get(anilistId);

	if (!entry) {
		throw new UnknownAnimeError(anilistId);
	}

	const mapping = await new Mapper(entry).resolve();
	const storedCards = await catalog.cards([anilistId]);

	const card = {
		...(storedCards.get(anilistId) ?? toCard(entry)),
		playbackEpisodes: await playableCount(anilistId),
	};

	const links = mappedEpisodes(mapping);
	const { key, movie, show } = await new MatchedTitle(anilistId, mapping).load();
	const [kind, tmdbId] = parseKey(key);
	const episodes = layoutEpisodes(card, links, show, movie);
	let shownKind: SeriesKind = "standalone";
	let logoUrl: string | null = null;

	if (kind !== "anilist") {
		shownKind = kind;
		logoUrl = imageUrl(await getLogoPath(kind, tmdbId), "w500");
	}

	let startDate: string | null = null;

	if (entry.startDate) {
		startDate = fuzzyDate(entry.startDate);
	}

	return {
		anilistId,
		backdropUrl:
			imageUrl(show?.backdropPath ?? movie?.backdrop_path ?? null, "original") ?? card.bannerUrl,
		episodes,
		key,
		kind: shownKind,
		logoUrl,
		mayGainEpisodes: mayGainEpisodes(entry, new Date()),
		nextAiring: card.nextEpisode && {
			airingAt: card.nextEpisode.airingAt,
			episode: card.nextEpisode.number,
		},
		overview: await new Overview(entry, links, show, movie, episodes.length).text(),
		posterUrl: imageUrl(movie?.poster_path ?? null, "w780") ?? card.coverUrl,
		related: (entry.relations?.edges ?? []).flatMap((edge) => {
			const node = edge?.node;

			if (node?.type !== "ANIME" || !edge?.relationType) {
				return [];
			}

			if (franchiseRelations.has(edge.relationType)) {
				return [
					{
						anilistId: node.id,
						relation: edge.relationType,
					},
				];
			}

			return [];
		}),
		startDate,
		status: card.status,
		title: card.title.display,
		useAniListAirings: mapping.method !== "compilation",
	};
};
