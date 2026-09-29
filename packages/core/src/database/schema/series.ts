import {
	boolean,
	doublePrecision,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";

import type { MediaStatus } from "../../anilist/graphql.generated";
import { jsonb, timestamptz } from "./columns";

export const tmdbMediaType = pgEnum("tmdb_media_type", ["tv", "movie"]);

/**
 * Where one AniList entry lives on TMDB.
 *
 * A TV mapping lists, per AniList episode, the TMDB episode it corresponds
 * to. Every AniList entry mapped to the same TMDB show belongs to one series.
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
 * One title as clients see it: a whole show with its seasons and OVAs, a
 * film, or an entry TMDB does not list.
 *
 * `id` is Sora's own ID and the only one clients ever see. It is tied to
 * `anchorAnilistId`, the first AniList entry of the first season, and never
 * changes when the series is laid out again. Title, synopsis, and artwork
 * belong to the series, not to its seasons.
 */
export const series = pgTable("series", {
	id: text("id").primaryKey(),
	/** The `SeriesKey` the entries were grouped by, such as `tv:82684`. */
	key: text("key").notNull().unique(),
	kind: seriesKind("kind").notNull(),
	anchorAnilistId: integer("anchor_anilist_id").notNull(),
	title: text("title").notNull(),
	overview: text("overview"),
	posterUrl: text("poster_url"),
	backdropUrl: text("backdrop_url"),
	logoUrl: text("logo_url"),
	/**
	 * Artwork someone chose in place of the laid-out poster, backdrop, or
	 * logo; {@link noArtwork} for none at all, null keeps the laid-out one.
	 * Laying the series out again never writes these, so a choice outlives it.
	 */
	posterUrlOverride: text("poster_url_override"),
	backdropUrlOverride: text("backdrop_url_override"),
	logoUrlOverride: text("logo_url_override"),
	/**
	 * Where and how large the logo is drawn on the series page, someone's
	 * choice like the overrides: its size relative to the usual one, and how
	 * far it is moved from its usual place, in widths of the page's hero.
	 */
	logoScale: doublePrecision("logo_scale").notNull().default(1),
	logoOffsetX: doublePrecision("logo_offset_x").notNull().default(0),
	logoOffsetY: doublePrecision("logo_offset_y").notNull().default(0),
	/** `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`. */
	startDate: text("start_date"),
	/** The series as a whole: airing while any of its entries airs. */
	status: text("status").$type<MediaStatus>(),
	/**
	 * The next episode to air, as a season episode. Written when the series is
	 * laid out; the airing scheduler lays it out again after each broadcast.
	 */
	nextEpisodeSeasonId: text("next_episode_season_id"),
	nextEpisodeNumber: integer("next_episode_number"),
	nextEpisodeAiringAt: timestamptz("next_episode_airing_at"),
	createdAt: timestamptz("created_at").notNull().defaultNow(),
	/** When the seasons and episodes were last laid out. */
	laidOutAt: timestamptz("laid_out_at").notNull(),
	/**
	 * The `key` whose TMDB images `series_image` holds, and when they were
	 * fetched; both null until they first are. A key other than `key` means
	 * the stored images belong to another TMDB title.
	 */
	imagesKey: text("images_key"),
	imagesFetchedAt: timestamptz("images_fetched_at"),
});

/**
 * Which series each AniList entry belongs to.
 *
 * An entry belongs to at most one series. Entries a series only lists as
 * related titles belong to their own series.
 */
export const seriesEntry = pgTable(
	"series_entry",
	{
		anilistId: integer("anilist_id").primaryKey(),
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
				onDelete: "cascade",
			}),
	},
	(table) => [index("series_entry_series_idx").on(table.seriesId)],
);

export const seasonKind = pgEnum("season_kind", ["season", "ova", "movie"]);

/**
 * One season of a series, in display order.
 *
 * `id` is tied to `anchorAnilistId`, the season's first AniList entry, so a
 * season keeps its ID when later cours are merged into it or seasons are
 * added around it. A season made only of extras TMDB lists has no anchor
 * and is matched by kind and number instead.
 */
export const seriesSeason = pgTable(
	"series_season",
	{
		id: text("id").primaryKey(),
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
				onDelete: "cascade",
			}),
		kind: seasonKind("kind").notNull(),
		/** Position among the series' seasons of the same kind, from 1. */
		number: integer("number").notNull(),
		/** Position among all of the series' seasons, from 0. */
		position: integer("position").notNull(),
		title: text("title").notNull(),
		/** Whether the season is part of the story in watch order rather than an extra; see `SeriesSeason.inWatchOrder`. */
		inWatchOrder: boolean("in_watch_order").notNull(),
		anchorAnilistId: integer("anchor_anilist_id"),
	},
	(table) => [index("series_season_series_idx").on(table.seriesId, table.position)],
);

/**
 * One episode of a season, numbered from 1 within the season.
 *
 * `anilistId` and `anilistEpisode` say which AniList episode plays here; both
 * are `null` for an extra only TMDB lists, which no provider serves.
 */
export const seriesEpisode = pgTable(
	"series_episode",
	{
		seasonId: text("season_id")
			.notNull()
			.references(() => seriesSeason.id, {
				onDelete: "cascade",
			}),
		number: integer("number").notNull(),
		anilistId: integer("anilist_id"),
		anilistEpisode: integer("anilist_episode"),
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
			columns: [table.seasonId, table.number],
		}),
		index("series_episode_anilist_idx").on(table.anilistId, table.anilistEpisode),
	],
);

export const imageType = pgEnum("image_type", ["poster", "backdrop", "logo"]);

/**
 * Every backdrop, poster, and logo TMDB had for a series when last fetched,
 * in every language, plus each season's posters for a show.
 *
 * Fetched the first time they are listed and kept until someone asks for
 * them again, so choosing artwork never waits on TMDB twice.
 */
export const seriesImage = pgTable(
	"series_image",
	{
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
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
			columns: [table.seriesId, table.type, table.url],
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
 * Other titles from a series' franchise: films, spin-offs, and shorts.
 *
 * A related title is recorded by one of its AniList entries rather than by
 * its series ID, because it may not be stored yet; `series_entry` finds its
 * series once it is.
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
		/** Display order, from 0. */
		position: integer("position").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.seriesId, table.anilistId],
		}),
	],
);
