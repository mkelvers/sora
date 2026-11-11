import { day } from "@sora/shared";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { anilist } from "../anilist/client";
import { TagsDocument } from "../anilist/graphql.generated";
import { catalogFormatAllowed, tagMinimumRank } from "../catalog/visibility";
import { db } from "../database/client";
import { animeSearch, animeSearchTag } from "../database/schema/catalog";
import type { Tag } from "../models/series";
import { carriedByAniKoto } from "./episodes";

/** Studios {@link listStudios} lists at most. */
const studioLimit = 30;

/** The index entries a client can browse to: not adult, not excluded, and carried by AniKoto. */
const browsable = and(
	eq(animeSearch.isAdult, false),
	catalogFormatAllowed(animeSearch.format),
	sql`${animeSearch.format} is distinct from 'MUSIC'`,
	carriedByAniKoto,
);

/**
 * Where AniList's tag category, such as `Theme-Fantasy` or
 * `Cast-Main Cast`, puts a tag in browsing; `null` for tags not offered,
 * such as `Technical` ones like CGI.
 */
const placeOf = (category: string): Pick<Tag, "group" | "section"> | null => {
	if (category === "Demographic") {
		return {
			group: "demographic",
			section: "Demographic",
		};
	}

	const [kind = "", ...rest] = category.split("-");
	const path = rest.join("-");
	const groups = {
		Cast: "cast",
		Setting: "setting",
		Theme: "theme",
	} as const;
	const group = groups[kind as keyof typeof groups];
	if (!group || !path) {
		return null;
	}

	// The last part names the most specific heading: `Game-Sport` is Sport.
	// Sci-Fi is one name with a hyphen in it.
	const sciFi = "Sci-Fi";
	let section = path.split("-").at(-1) ?? path;
	if (path === sciFi) {
		section = sciFi;
	} else if (path.startsWith(`${sciFi}-`)) {
		section = path.slice(sciFi.length + 1);
	}
	return {
		group,
		section,
	};
};

/**
 * Every tag a client can browse by, such as Isekai or Seinen, grouped as
 * {@link Tag} describes. Tags AniList keeps for adult media, technical tags
 * such as CGI, and tags no title Sora can play carries strongly are left
 * out. Ordered by group, then section, then name.
 */
export const listTags = async (): Promise<Tag[]> => {
	const [{ MediaTagCollection }, carried] = await Promise.all([
		anilist(
			TagsDocument,
			{},
			{
				maxAgeMs: 7 * day,
			},
		),
		db
			.select({
				tag: animeSearchTag.tag,
			})
			.from(animeSearchTag)
			.innerJoin(animeSearch, eq(animeSearch.anilistId, animeSearchTag.anilistId))
			.where(
				and(
					browsable,
					sql`${animeSearchTag.rank} >= ${tagMinimumRank}`,
					eq(animeSearchTag.spoiler, false),
				),
			)
			.groupBy(animeSearchTag.tag),
	]);
	const offered = new Set(carried.map((row) => row.tag));
	const groupOrder: Tag["group"][] = ["demographic", "theme", "setting", "cast"];

	return (MediaTagCollection ?? [])
		.flatMap((tag): Tag[] => {
			const place = tag?.category ? placeOf(tag.category) : null;
			return tag && place && tag.isAdult !== true && offered.has(tag.name)
				? [
						{
							description: tag.description?.trim() || null,
							name: tag.name,
							...place,
						},
					]
				: [];
		})
		.toSorted(
			(left, right) =>
				groupOrder.indexOf(left.group) - groupOrder.indexOf(right.group) ||
				left.section.localeCompare(right.section) ||
				left.name.localeCompare(right.name),
		);
};

/**
 * The main studios of titles Sora can play, those with the most titles
 * first, by name; narrowed to names containing `query` when given.
 */
export const listStudios = async (query?: string): Promise<string[]> => {
	const studio = sql<string>`studio`;
	const rows = await db
		.select({
			studio,
		})
		.from(
			sql`${animeSearch} cross join jsonb_array_elements_text(${animeSearch.studios}) as studio`,
		)
		.where(
			and(
				browsable,
				query
					? sql`${studio} ilike ${`%${query.replaceAll(/[\\%_]/gu, (character) => `\\${character}`)}%`}`
					: undefined,
			),
		)
		.groupBy(studio)
		.orderBy(desc(sql`count(*)`), asc(studio))
		.limit(studioLimit);

	return rows.map((row) => row.studio);
};
