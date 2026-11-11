import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { db } from "../../database/client";
import { skipSegmentLength } from "../../database/schema/playback";
import { series } from "../../database/schema/series";
import { normalizeSkipSegments } from "./skip-lengths";

const firstTestEpisode = 9000;
const waitingMs = 1000;

// Opt in against a migrated local database. The fixture series and its skip
// lengths are removed even when an assertion fails.
describe.skipIf(process.env.SORA_SKIP_LENGTH_INTEGRATION !== "1")("normalizeSkipSegments", () => {
	const seriesId = `skip-length-test-${crypto.randomUUID()}`;

	beforeAll(async () => {
		await db.insert(series).values({
			anilistId: -Math.floor(Math.random() * 1_000_000_000) - 1,
			id: seriesId,
			key: seriesId,
			kind: "standalone",
			laidOutAt: new Date(),
			title: "Skip length test",
		});
	});

	afterAll(async () => {
		await db.delete(skipSegmentLength).where(eq(skipSegmentLength.seriesId, seriesId));
		await db.delete(series).where(eq(series.id, seriesId));
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
