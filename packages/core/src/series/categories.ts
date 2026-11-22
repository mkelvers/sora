import { day } from "@sora/shared";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { anilist } from "../anilist/client";
import { TagsDocument } from "../anilist/graphql.generated";
import { zTagsQuery } from "../anilist/validation.generated";
import { formatAllowed, tagMinimumRank } from "../catalog/visibility";
import { db } from "../database/client";
import { animeSearch, animeSearchTag } from "../database/schema/catalog";
import type { Tag } from "../models/series";
import { Category } from "./category";
import { carriedByAniKoto } from "./episodes";

/** The index entries a client can browse to: not adult, not excluded, and carried by AniKoto. */
const browsable = and(
	eq(animeSearch.isAdult, false),
	formatAllowed(animeSearch.format),
	sql`${animeSearch.format} is distinct from 'MUSIC'`,
	carriedByAniKoto,
);

/**
 * Every tag a client can browse by, such as Isekai or Seinen, grouped as
 * {@link Tag} describes. Tags AniList keeps for adult media, technical tags
 * such as CGI, and tags no title Sora can play carries strongly are left
 * out. Ordered by group, then section, then name.
 */
export const listTags = async (): Promise<Tag[]> => {
	const [{ MediaTagCollection }, carried] = await Promise.all([
		anilist(TagsDocument, {}, zTagsQuery, {
			maxAgeMs: 7 * day,
		}),
		db
			.select({
				tag: animeSearchTag.tag,
				titles: count(),
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

	const titles = new Map(carried.map((row) => [row.tag, row.titles]));
	const groupOrder: Tag["group"][] = ["demographic", "theme", "setting", "cast"];

	return (MediaTagCollection ?? [])
		.flatMap((tag): Tag[] => {
			const { place } = new Category(tag?.category);
			const shown = tag && place && tag.isAdult !== true && titles.has(tag.name);

			if (!shown) {
				return [];
			}

			return [
				{
					description: tag.description?.trim() || null,
					name: tag.name,
					titles: titles.get(tag.name) ?? 0,
					...place,
				},
			];
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
	/** Studios {@link listStudios} lists at most. */
	const studioLimit = 30;

	const studio = sql<string>`studio`;
	let named: SQL | undefined;

	if (query) {
		named = sql`${studio} ilike ${`%${query.replaceAll(/[\\%_]/gu, (character) => `\\${character}`)}%`}`;
	}

	const rows = await db
		.select({
			studio,
		})
		.from(
			sql`${animeSearch} cross join jsonb_array_elements_text(${animeSearch.studios}) as studio`,
		)
		.where(and(browsable, named))
		.groupBy(studio)
		.orderBy(desc(sql`count(*)`), asc(studio))
		.limit(studioLimit);

	return rows.map((row) => row.studio);
};
