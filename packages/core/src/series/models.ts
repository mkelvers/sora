import type { AnimeFormat, AnimeStatus, AnimeTag } from "../catalog/models/anime";
import type { ImageEdges } from "./edges";
import type { FranchisePart } from "./franchise";
import type { SeriesKind } from "./series";

/**
 * How an episode is watched: dubbed audio, the original audio with subtitles
 * (sub), or the original audio alone (raw).
 */
export type ContentLanguage = "sub" | "dub" | "raw";

/**
 * A title for lists, grids, and search results: one AniList entry, such as
 * a season of a show, a film, or an OVA.
 *
 * @remarks
 * Like every series model, this is a plain JSON-safe value and carries only
 * Sora's own IDs.
 */
export interface SeriesCard {
	/** Sora's series ID, such as `GYZJ43JMR`. */
	id: string;
	kind: SeriesKind;
	/** What AniList lists the entry as, such as a TV season, a film, or an OVA. */
	format: AnimeFormat | null;
	/** AniList's title of the entry, which names its season: "Frieren: Beyond Journey's End Season 2". */
	title: string;
	/** AniList's cover of the entry. */
	posterUrl: string | null;
	/** TMDB's backdrop of the show or film, or AniList's banner when TMDB has none. */
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
	status: AnimeStatus | null;
	/**
	 * The audio any of its episodes can be watched with, dub before sub before
	 * raw. Empty when nothing streams it, or while its providers have not been
	 * looked up yet.
	 */
	audio: ContentLanguage[];
	/** TMDB's synopsis where it describes the entry, or AniList's. */
	overview: string | null;
	/** AniList's weighted score, 0–100. */
	score: number | null;
	/** AniList's genres. */
	genres: string[];
	/** How many episodes it lists, as its page lists them. */
	episodeCount: number;
}

/**
 * A title's latest episode that can be watched, for a list of what was added
 * lately: a new episode of a show counts, not only a new title.
 */
export interface Release {
	series: SeriesCard;
	/** The episode's number in the series, from 1. */
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

/** Everything needed for a title's page, except its episodes; see `getSeriesEpisodes`. */
export interface Series extends SeriesCard {
	/** First release: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, as precise as AniList knows it. */
	startDate: string | null;
	genres: string[];
	tags: AnimeTag[];
	studios: string[];
	/** How many AniList users have scored it, behind `score`; `null` until the search index has it. */
	scoreCount: number | null;
	/**
	 * The next episode to come out: one that aired but that its season does
	 * not list yet because AniKoto does not carry it, for as long as it is
	 * still expected (see `isEpisodeAwaited` and `expectedRelease`), else the
	 * next to air. `null` when there is neither.
	 */
	nextEpisode: {
		/** The episode's number in the series, from 1. */
		number: number;
		/**
		 * ISO 8601 timestamp of when it airs. For one that aired and is still to
		 * come out, when it is expected: in the past, unless its subbed stream
		 * or a put-off broadcast is still ahead.
		 */
		airingAt: string;
	} | null;
	/**
	 * The backdrop's average colour down its left and right edges, to fill
	 * the space beside it when it is shown whole. `null` without a backdrop,
	 * or until it is measured.
	 */
	backdropEdges: ImageEdges | null;
	/**
	 * Every title of its franchise that is out, this one included, as AniList
	 * relates them: its seasons first, then its films, OVAs, and spin-offs (see
	 * `franchiseParts`). Just this one when it has no other.
	 */
	franchise: FranchisePart[];
}

/** One episode of a title. */
export interface Episode {
	/** The episode's number in the series, from 1. */
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
}
