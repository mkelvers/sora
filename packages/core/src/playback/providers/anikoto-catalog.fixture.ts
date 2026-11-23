import type { Anime } from "../../catalog/models/anime";
import { anime } from "../../catalog/models/anime.fixture";
import type { anikotoSeries } from "../../database/schema/playback";
import { Series } from "./series";

/** Frieren as AniKoto's catalogue listing sends it. */
export const frieren = {
	alternative: "Sousou no Frieren",
	ani_id: "154587",
	episodes: "28",
	id: 6351,
	mal_id: "52991",
	native: "葬送のフリーレン",
	rating: "PG-13",
	terms_by_type: {
		type: ["TV"],
	},
	title: "Frieren: Beyond Journey's End",
	titles: "Frieren: Beyond Journey's End",
	updated_at: "2024-10-18 09:15:13",
	year: 2023,
};

/** An AniList entry with what matching reads; the rest is left blank. */
export const animeWith = (
	fields: Partial<Anime> & Pick<Anime, "id" | "malId" | "format">,
): Anime => ({
	...anime(fields.id),
	status: "FINISHED",
	...fields,
});

/** A stored AniKoto series, as the mirror holds it. */
export const series = (
	fields: Partial<typeof anikotoSeries.$inferInsert> & {
		anikotoId: number;
		title: string;
	},
) => ({
	anilistId: null,
	episodes: null,
	format: null,
	malId: null,
	rating: null,
	titles: [fields.title],
	updatedAt: new Date(0),
	year: null,
	...fields,
});

/** The format AniKoto's catalogue type `type` is read as. */
export const format = (type: string) =>
	new Series({
		...frieren,
		terms_by_type: {
			type: [type],
		},
	}).row?.format;
