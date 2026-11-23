import { expect, test } from "bun:test";

import { getTableName, sql } from "drizzle-orm";
import { Logger } from "graphile-worker";

import { db } from "../../database/client";
import { tmdbResponse } from "../../database/schema/catalog";
import { providerEpisodes } from "../../database/schema/playback";
import { series, titleEpisode, tmdbMapping } from "../../database/schema/series";
import { aniKoto } from "../../playback/providers/registry";
import { refreshEpisodeListings } from "./series";

test("refreshing episode listings handles an unlisted episode without a release date", async () => {
	// The job scans the entire catalogue. Keep it on the fixtures even when
	// the integration suite runs on a populated development database.
	await Promise.all(
		[series, titleEpisode, providerEpisodes, tmdbMapping, tmdbResponse].map((table) => {
			const name = sql.identifier(getTableName(table));

			return db.execute(sql`
				create temporary table ${name}
				(like public.${name} including all)
				on commit drop
			`);
		}),
	);

	const id = "undated-episode";
	const anilistId = 123;
	const showId = 456;
	const now = new Date();

	await db.insert(series).values({
		anilistId,
		id,
		key: `tv:${showId}`,
		kind: "tv",
		laidOutAt: now,
		title: "Undated episode",
	});

	await db.insert(titleEpisode).values({
		number: 1,
		seriesId: id,
	});

	await db.insert(providerEpisodes).values({
		anilistId,
		fetchedAt: now,
		provider: aniKoto.id,
		units: [
			{
				languages: ["sub"],
				number: 1,
			},
		],
	});

	// The fresh cache entry lets the job finish without calling TMDB.
	await db.insert(tmdbResponse).values({
		data: {},
		fetchedAt: now,
		key: id,
		path: `/tv/${showId}`,
	});

	const messages: string[] = [];

	const logger = new Logger(() => (_level, message) => {
		messages.push(message);
	});

	await refreshEpisodeListings({}, { logger });

	expect(messages).toEqual([
		"Asked TMDB for 0 of 1 shows it is behind on, filled in 0 episodes, and queued 0 of 1 series to be laid out again",
	]);
});
