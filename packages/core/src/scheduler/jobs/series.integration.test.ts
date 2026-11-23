import { beforeEach, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";

import { day } from "@sora/shared";
import { eq, getTableName, sql } from "drizzle-orm";
import { Logger } from "graphile-worker";

import { db } from "../../database/client";
import { tmdbResponse } from "../../database/schema/catalog";
import { providerEpisodes } from "../../database/schema/playback";
import { series, titleEpisode, tmdbMapping } from "../../database/schema/series";
import { aniKoto } from "../../playback/providers/registry";
import { refreshEpisodeDetails, refreshEpisodeListings } from "./series";

beforeEach(async () => {
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
});

test("refreshing episode listings handles an unlisted episode without a release date", async () => {
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

test("refreshing episode details uses the known release date when TMDB has a stale air date", async () => {
	const id = "stale-air-date";
	const anilistId = 124;
	const showId = 457;
	const episodeId = 458;
	const now = new Date();
	const airedAt = new Date(now.getTime() - day);
	const staleAirDate = new Date(now.getTime() + 5 * day).toISOString().slice(0, 10);

	await db.insert(series).values({
		anilistId,
		id,
		key: `tv:${showId}`,
		kind: "tv",
		laidOutAt: now,
		title: "Stale air date",
	});

	await db.insert(titleEpisode).values({
		airDate: staleAirDate,
		airedAt,
		number: 1,
		seriesId: id,
		stillUrl: "https://image.tmdb.org/t/p/original/still.jpg",
		title: "Episode 1",
		tmdbEpisodeNumber: 1,
		tmdbSeasonNumber: 1,
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

	const showUrl = new URL(`https://api.themoviedb.org/3/tv/${showId}`);
	const seasons = Array.from({ length: 20 }, (_, season) => `season/${season}`);
	showUrl.searchParams.set("append_to_response", seasons.join(","));
	showUrl.searchParams.set("language", "en-US");

	const changesUrl = new URL(`https://api.themoviedb.org/3/tv/episode/${episodeId}/changes`);
	changesUrl.searchParams.set(
		"end_date",
		new Date(airedAt.getTime() + 13 * day).toISOString().slice(0, 10),
	);
	changesUrl.searchParams.set(
		"start_date",
		new Date(airedAt.getTime() - day).toISOString().slice(0, 10),
	);

	await db.insert(tmdbResponse).values([
		{
			data: {
				id: showId,
				name: "Stale air date",
				original_name: "Stale air date",
				"season/1": {
					episodes: [
						{
							air_date: staleAirDate,
							episode_number: 1,
							id: episodeId,
							name: "Episode 1",
							season_number: 1,
							still_path: "/still.jpg",
						},
					],
				},
				seasons: [
					{
						episode_count: 1,
						season_number: 1,
					},
				],
			},
			fetchedAt: now,
			key: createHash("sha256").update(showUrl.href).digest("hex"),
			path: `/tv/${showId}`,
		},
		{
			data: {
				changes: [
					{
						items: [
							{
								action: "added",
								iso_639_1: "en",
								time: airedAt.toISOString(),
								value: "The Guild",
							},
						],
						key: "name",
					},
					{
						items: [
							{
								action: "added",
								iso_639_1: "en",
								time: airedAt.toISOString(),
								value: "The party joins a guild.",
							},
						],
						key: "overview",
					},
				],
			},
			fetchedAt: now,
			key: createHash("sha256").update(changesUrl.href).digest("hex"),
			path: `/tv/episode/${episodeId}/changes`,
		},
	]);

	const logger = new Logger(() => mock());

	await refreshEpisodeDetails({}, { logger });

	const [episode] = await db.select().from(titleEpisode).where(eq(titleEpisode.seriesId, id));

	expect(episode).toMatchObject({
		airDate: staleAirDate,
		overview: "The party joins a guild.",
		title: "The Guild",
	});
});
