import { boolean, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { jsonb, timestamptz } from "./columns";
import { series } from "./series";

/**
 * A title featured on one user's home page for one rotation (see
 * `rotationOf`), in `position` order. Kept for the rotation before as well,
 * so the next never features the same titles again.
 */
export const featuredPick = pgTable(
	"featured_pick",
	{
		userId: text("user_id").notNull(),
		rotation: integer("rotation").notNull(),
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
				onDelete: "cascade",
			}),
		position: integer("position").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.rotation, table.seriesId],
		}),
	],
);

/**
 * How one user likes episodes to play, remembered from what they pick in
 * the player. A user without a row plays everything the default way; see
 * `getPlaybackPreferences`.
 */
export const playbackPreference = pgTable("playback_preference", {
	userId: text("user_id").primaryKey(),
	/** `sub`, `dub`, or `raw`; `null` plays the first version an episode has. */
	audio: text("audio"),
	/**
	 * The subtitles picked for each audio, keyed by `sub` or `dub`: a track's
	 * language and kind, or `null` for none. An audio missing here shows its
	 * default track.
	 */
	subtitles: jsonb("subtitles").$type<unknown>().notNull().default({}),
	/** Whether openings and endings are skipped without asking. */
	autoSkip: boolean("auto_skip").notNull().default(false),
	updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});
