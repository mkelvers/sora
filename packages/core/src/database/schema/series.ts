import {
	doublePrecision,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";

import type { MediaRelation, MediaStatus } from "../../anilist/graphql.generated";
import { jsonb, timestamptz } from "./columns";

export const tmdbMediaType = pgEnum("tmdb_media_type", ["tv", "movie"]);

/**
 * Where one AniList entry lives on TMDB.
 *
 * A TV mapping lists, per AniList episode, the TMDB episode it corresponds
 * to, which the episode's details come from.
 *
 * A row with a null `tmdbId` records that no confident match exists, so the
 * search is not repeated on every request.
 */
export const tmdbMapping = pgTable(
	"tmdb_mapping",
	{
		anilistId: integer("anilist_id").primaryKey(),
		mediaType: tmdbMediaType("media_type"),
		tmdbId: integer("tmdb_id"),
		/** TMDB season of the entry's first mapped episode; `0` is TMDB's specials season. */
		seasonNumber: integer("season_number"),
		/** TMDB episode number of the entry's first mapped episode, for ordering entries within a show. */
		episodeNumber: integer("episode_number"),
		/** `EpisodeLink[]` for TV mappings, empty otherwise. */
		episodes: jsonb("episodes").$type<unknown>().notNull(),
		/** Which signal decided the match, for diagnosing bad mappings. */
		method: text("method"),
		score: doublePrecision("score"),
		resolvedAt: timestamptz("resolved_at").notNull(),
	},
	(table) => [index("tmdb_mapping_target_idx").on(table.mediaType, table.tmdbId)],
);

/**
 * TMDB titles that the community-kept Fribb/anime-lists project links to an
 * AniList entry.
 *
 * A hint is only a candidate: matching still decides from air dates and
 * episode counts whether, and where, the entry sits in it. Hints find the
 * TMDB title a title search misses, as when AniList and TMDB name a show
 * differently. The scheduler keeps them current; see `syncTmdbHints`.
 */
export const tmdbHint = pgTable("tmdb_hint", {
	anilistId: integer("anilist_id").primaryKey(),
	showId: integer("show_id"),
	movieIds: integer("movie_ids").array().notNull(),
});

export const seriesKind = pgEnum("series_kind", ["tv", "movie", "standalone"]);

/** An artwork override meaning the series shows no image of that kind. */
export const noArtwork = "";

/**
 * One title as clients see it: one AniList entry, such as a season of a
 * show, a film, or an OVA. Entries of one franchise are titles of their own,
 * told apart by their titles and found from one another as
 * {@link seriesRelated} links them.
 *
 * `id` is Sora's own ID and the only one clients ever see. It belongs to
 * `anilistId` for good and never changes when the series is laid out again.
 */
export const series = pgTable(
	"series",
	{
		id: text("id").primaryKey(),
		/** The AniList entry the series is. */
		anilistId: integer("anilist_id").notNull().unique(),
		/**
		 * The `SeriesKey` of the TMDB title the entry was matched to, such as
		 * `tv:82684`, which its backdrop, logo, and episode details come from.
		 * Seasons of one show share it.
		 */
		key: text("key").notNull(),
		kind: seriesKind("kind").notNull(),
		title: text("title").notNull(),
		overview: text("overview"),
		posterUrl: text("poster_url"),
		backdropUrl: text("backdrop_url"),
		logoUrl: text("logo_url"),
		/**
		 * A poster someone chose in place of the laid-out one; {@link noArtwork}
		 * for none at all, null keeps the laid-out one. A poster tells one
		 * season from another, so it is chosen per series; the backdrop and logo
		 * are the TMDB title's, and chosen for it (see {@link titleArtwork}).
		 * Laying the series out again never writes this, so a choice outlives it.
		 */
		posterUrlOverride: text("poster_url_override"),
		/** `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`. */
		startDate: text("start_date"),
		status: text("status").$type<MediaStatus>(),
		/**
		 * The next episode to air. Written when the series is laid out; the
		 * airing scheduler lays it out again after each broadcast.
		 */
		nextEpisodeNumber: integer("next_episode_number"),
		nextEpisodeAiringAt: timestamptz("next_episode_airing_at"),
		createdAt: timestamptz("created_at").notNull().defaultNow(),
		/** When the episodes were last laid out. */
		laidOutAt: timestamptz("laid_out_at").notNull(),
	},
	(table) => [index("series_key_idx").on(table.key)],
);

/**
 * Artwork of a TMDB title, keyed by the `SeriesKey` its series share, such
 * as `tv:82684`, so every season and special laid out from one show shows
 * the same: the backdrop and logo someone chose for it, and when its images
 * ({@link titleImage}) were fetched. A series matched to the title later
 * shows them too. Laying a series out again never writes these, so a choice
 * outlives it.
 */
export const titleArtwork = pgTable("title_artwork", {
	key: text("key").primaryKey(),
	/** When {@link titleImage} last got the title's images from TMDB; `null` until it first has. */
	imagesFetchedAt: timestamptz("images_fetched_at"),
	/** In place of the laid-out one; {@link noArtwork} for none at all, null keeps the laid-out one. */
	backdropUrlOverride: text("backdrop_url_override"),
	logoUrlOverride: text("logo_url_override"),
	/**
	 * Where and how large the logo is drawn on a series page: its size
	 * relative to the usual one, and how far it is moved from its usual place,
	 * in widths of the page's hero.
	 */
	logoScale: doublePrecision("logo_scale").notNull().default(1),
	logoOffsetX: doublePrecision("logo_offset_x").notNull().default(0),
	logoOffsetY: doublePrecision("logo_offset_y").notNull().default(0),
});

/**
 * One episode of a series, numbered as AniList numbers the entry's
 * episodes, from 1. Its details come from the TMDB episode it was matched
 * to, when there is one.
 */
export const seriesEpisode = pgTable(
	"series_episode",
	{
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
				onDelete: "cascade",
			}),
		number: integer("number").notNull(),
		title: text("title"),
		overview: text("overview"),
		/** `YYYY-MM-DD`, in the calendar of the country it aired in, as TMDB lists it. */
		airDate: text("air_date"),
		/** When the episode aired, from AniList's airing schedule; null when AniList has no schedule for it. */
		airedAt: timestamptz("aired_at"),
		runtimeMinutes: integer("runtime_minutes"),
		stillUrl: text("still_url"),
		tmdbSeasonNumber: integer("tmdb_season_number"),
		tmdbEpisodeNumber: integer("tmdb_episode_number"),
	},
	(table) => [
		primaryKey({
			columns: [table.seriesId, table.number],
		}),
	],
);

export const imageType = pgEnum("image_type", ["poster", "backdrop", "logo"]);

/**
 * Every backdrop, poster, and logo TMDB had for a title when last fetched,
 * in every language, plus each season's posters for a show, keyed by the
 * title's `SeriesKey` as {@link titleArtwork} is.
 *
 * Fetched the first time they are listed and kept until someone asks for
 * them again, so choosing artwork never waits on TMDB twice.
 */
export const titleImage = pgTable(
	"title_image",
	{
		key: text("key")
			.notNull()
			.references(() => titleArtwork.key, {
				onDelete: "cascade",
			}),
		type: imageType("type").notNull(),
		/** The original size on TMDB's image host. */
		url: text("url").notNull(),
		width: integer("width").notNull(),
		height: integer("height").notNull(),
		/** ISO 639-1 code of any text on the image; null when it has none. */
		language: text("language"),
		voteAverage: doublePrecision("vote_average").notNull(),
		voteCount: integer("vote_count").notNull(),
		/** TMDB's number of the season a poster is for; null for the title's own. */
		seasonNumber: integer("season_number"),
	},
	(table) => [
		primaryKey({
			columns: [table.key, table.type, table.url],
		}),
	],
);

/**
 * The average colour down an image's left and right edges, keyed by its URL,
 * so a page can fill the space beside a backdrop shown whole with colours
 * that continue it. Measured once per URL; see `storeImageEdges`.
 */
export const imageEdge = pgTable("image_edge", {
	url: text("url").primaryKey(),
	/** `#rrggbb`. */
	left: text("left").notNull(),
	/** `#rrggbb`. */
	right: text("right").notNull(),
});

/**
 * The AniList entries a series' own entry is related to, as AniList relates
 * them: its prequel, sequel, side stories, and the like. A franchise is found
 * by following these from series to series, in either direction; see
 * `franchiseOf`.
 *
 * A related entry is recorded by its AniList ID rather than by its series
 * ID, because it may not be stored yet.
 */
export const seriesRelated = pgTable(
	"series_related",
	{
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
				onDelete: "cascade",
			}),
		anilistId: integer("anilist_id").notNull(),
		/** How AniList relates the entry to the series' own, such as `SEQUEL`. */
		relation: text("relation").$type<MediaRelation>().notNull(),
		/** The order AniList lists the relations in, from 0. */
		position: integer("position").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.seriesId, table.anilistId],
		}),
		index("series_related_anilist_idx").on(table.anilistId),
	],
);
