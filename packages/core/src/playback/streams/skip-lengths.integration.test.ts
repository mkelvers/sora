import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { and, eq, gte } from "drizzle-orm";

import { closeDatabase, db } from "../../database/client";
import { skipSegmentLength } from "../../database/schema/playback";
import { series } from "../../database/schema/series";
import { normalizeSkipSegments } from "./skip-lengths";

const firstTestEpisode = 9000;
const waitingMs = 1000;

// Opt in against a migrated local database with at least one series. Only
// rows for episode numbers no real series reaches are written and removed.
describe.skipIf(process.env.SORA_SKIP_LENGTH_INTEGRATION !== "1")("normalizeSkipSegments", () => {
	let seriesId = "";

	const cleanUp = async () => {
		if (seriesId) {
			await db
				.delete(skipSegmentLength)
				.where(
					and(
						eq(skipSegmentLength.seriesId, seriesId),
						gte(skipSegmentLength.episode, firstTestEpisode),
					),
				);
		}
	};

	beforeAll(async () => {
		const [first] = await db
			.select({
				id: series.id,
			})
			.from(series)
			.limit(1);
		seriesId = first?.id ?? "";
	});

	afterAll(async () => {
		await cleanUp();
		await closeDatabase();
	});

	test("does not wait for the provider's other episodes", async () => {
		const opening = {
			end: 120,
			kind: "opening",
			start: 30,
		} as const;
		const started = performance.now();
		const segments = await normalizeSkipSegments(seriesId, firstTestEpisode, "sub", [opening], {
			episodes: [firstTestEpisode, firstTestEpisode + 1, firstTestEpisode + 2],
			skipSegments: () => Promise.withResolvers<null>().promise,
		});

		expect(performance.now() - started).toBeLessThan(waitingMs);
		expect(segments).toEqual([opening]);
	});
});
