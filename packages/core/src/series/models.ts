import type { AnimeFormat, AnimeStatus, AnimeTag } from "../catalog/models/anime";
import type { ImageEdges } from "./edges";
import type { SeasonKind } from "./seasons";
import type { SeriesKind } from "./series";

/**
 * How an episode is watched: dubbed audio, the original audio with subtitles
 * (sub), or the original audio alone (raw).
 */
export type ContentLanguage = "sub" | "dub" | "raw";

/**
 * A title for lists, grids, and search results.
 *
 * @remarks
 * Like every series model, this is a plain JSON-safe value and carries only
 * Sora's own IDs.
 */
export interface SeriesCard {
	/** Sora's series ID, such as `GYZJ43JMR`. */
	id: string;
	kind: SeriesKind;
	/** The title of the first season, or of the film. */
	title: string;
	/** TMDB's artwork for the whole title, or AniList's when TMDB has none. */
	posterUrl: string | null;
	backdropUrl: string | null;
	/** TMDB's English or textless logo, drawn over the backdrop. */
	logoUrl: string | null;
	/** How large to draw the logo, relative to its usual size: 1 is as usual. */
	logoScale: number;
	/** How far right to move the logo from its usual place, in widths of the series page's hero. */
	logoOffsetX: number;
	/** How far down to move the logo from its usual place, in widths of the series page's hero. */
	logoOffsetY: number;
	/** Year of the first release. */
	year: number | null;
	/** Airing while any season airs; see `seriesStatus`. */
	status: AnimeStatus | null;
	/**
	 * The audio any of its episodes can be watched with, dub before sub before
	 * raw. Empty when nothing streams it, or while its providers have not been
	 * looked up yet.
	 */
	audio: ContentLanguage[];
	/** TMDB's synopsis of the title, or AniList's of the first season when TMDB has none. */
	overview: string | null;
	/** AniList's weighted score of the first season, 0–100. */
	score: number | null;
	/** AniList's genres of the first season. */
	genres: string[];
	/** How many regular seasons it has, OVAs and films left out. A film has none. */
	seasonCount: number;
	/** How many episodes its regular seasons list, as their season pages list them. */
	episodeCount: number;
	/**
	 * The season watching starts at: the first in watch order, or the first
	 * season when none is. `null` for a title with no seasons laid out.
	 */
	startSeasonId: string | null;
}

/**
 * A title's latest episode that can be watched, for a list of what was added
 * lately: a new episode of a show counts, not only a new title.
 */
export interface Release {
	series: SeriesCard;
	seasonId: string;
	/** The season's title, such as "Season 2"; see {@link Season.title}. */
	seasonTitle: string;
	/** Position within the season, from 1. */
	episode: number;
	/** When the episode came out, as an ISO 8601 timestamp: when it aired, or its air date's midnight UTC when AniList has no airing time. */
	releasedAt: string;
}

/**
 * A title a search or browse found that is not stored yet. It is being
 * prepared in the background and appears as a {@link SeriesCard} once it is;
 * until then only what the search index knows about it can be shown.
 */
export interface PreparingTitle {
	anilistId: number;
	/** English, then romaji, then native, as AniList lists it. */
	title: string;
	format: AnimeFormat | null;
	year: number | null;
	/** Where on the page, from 0 among its cards, the title is expected once prepared. */
	position: number;
}

/**
 * Everything needed for a title's page.
 *
 * Details belong to the title, not to its seasons: synopsis and artwork come
 * from TMDB, and genres, tags, studios, and score from the first season.
 * Only the episodes differ between seasons; see `getSeasonEpisodes`.
 */
export interface Series extends SeriesCard {
	/** First release: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, as precise as AniList knows it. */
	startDate: string | null;
	genres: string[];
	tags: AnimeTag[];
	studios: string[];
	/** How many AniList users have scored the first season, behind `score`; `null` until the search index has it. */
	scoreCount: number | null;
	/** The next episode to air, or `null` when none is announced. */
	nextEpisode: {
		seasonId: string;
		/** Position within the season, from 1. */
		number: number;
		/** ISO 8601 timestamp. */
		airingAt: string;
	} | null;
	/**
	 * The backdrop's average colour down its left and right edges, to fill
	 * the space beside it when it is shown whole. `null` without a backdrop,
	 * or until it is measured.
	 */
	backdropEdges: ImageEdges | null;
	/** Seasons in watch order, films and OVAs between them included, then extra OVA seasons. A film has one. */
	seasons: Season[];
	/** Other titles from the franchise: films, spin-offs, and shorts. */
	related: SeriesCard[];
}

/** One season of a title, as listed in its season picker. */
export interface Season {
	/** Sora's season ID, such as `G6NQ5DWZ6`. */
	id: string;
	kind: SeasonKind;
	/** Position among the title's seasons of the same kind, from 1. */
	number: number;
	/** TMDB's name for the season ("Mugen Train Arc") or "Season N"; for an OVA or film, what its title adds to the show's ("Visions of Coleus") or "OVA Season N" / "Movie N". */
	title: string;
	/**
	 * Whether the season is part of the story in watch order: regular seasons
	 * and the films and OVAs between them. Extras, such as side-story OVAs and
	 * recaps, are not.
	 */
	inWatchOrder: boolean;
	episodeCount: number;
}

/** One episode of a season. */
export interface SeasonEpisode {
	/** Position within the season, from 1. */
	number: number;
	title: string | null;
	overview: string | null;
	/** `YYYY-MM-DD`, in the calendar of the country it aired in, as TMDB lists it. */
	airDate: string | null;
	/**
	 * ISO 8601 timestamp of the broadcast, from AniList's airing schedule; a
	 * client shows it in the viewer's time zone. `null` when AniList has no
	 * schedule for the episode, as for most older anime; `airDate` is then the
	 * only date known.
	 */
	airedAt: string | null;
	runtimeMinutes: number | null;
	stillUrl: string | null;
	/**
	 * The audio the episode can be watched with, dub before sub before raw, in
	 * any locale. Empty when nothing streams it, and `null` only while its
	 * providers have not been looked up yet.
	 */
	audio: ContentLanguage[] | null;
	/**
	 * Whether the episode is filler: story the manga does not have, made to let
	 * the anime fall behind it. `false` when no provider says it is.
	 */
	filler: boolean;
	/** An extra only TMDB lists, such as a recap special. No provider streams it. */
	extra: boolean;
}
