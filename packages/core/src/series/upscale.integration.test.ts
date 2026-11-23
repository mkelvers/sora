import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { eq, sql } from "drizzle-orm";

import { db } from "../database/client";
import { series, titleArtwork, titleBackdropUpscale, titleImage } from "../database/schema/series";
import { pools } from "../scheduler/pools";
import { upscaleBackdropTask } from "../scheduler/queue";
import { statusesOf, upscales } from "./upscale";

describe("backdrop upscale queue", () => {
	/** The series key the fixtures use; queries are scoped to it, so the development database's own upscales stay out. */
	const key = "tv:2147483646";
	const id = "upscale-test";

	const jobs = async () => {
		const rows = await db.execute<{
			attempts: number;
			id: string;
			last_error: string | null;
			locked_by: string | null;
			revision: number;
		}>(sql`
			select attempts, id::text, last_error, locked_by, revision from graphile_worker.jobs
			where task_identifier = ${upscaleBackdropTask}
				and key in (select 'upscale-backdrop:' || id from title_backdrop_upscale where key = ${key})
		`);

		return [...rows];
	};

	const claim = async (lockedAt: Date) => {
		const lockedBy = "pool-upscale-test";
		const timestamp = lockedAt.toISOString();
		await db.execute(sql`
			update graphile_worker._private_jobs
			set attempts = max_attempts, locked_at = ${timestamp}::timestamptz, locked_by = ${lockedBy}
			where key in (select 'upscale-backdrop:' || id from title_backdrop_upscale where key = ${key})
		`);
		await db.execute(sql`
			update graphile_worker._private_job_queues
			set locked_at = ${timestamp}::timestamptz, locked_by = ${lockedBy}
			where queue_name = 'upscale-backdrop'
		`);
	};

	/** Records a failed final attempt the way graphile-worker does: attempts used up, the error kept, the lock released. */
	const exhaust = async (error: string) => {
		await db.execute(sql`
			update graphile_worker._private_jobs
			set attempts = max_attempts, last_error = ${error}, locked_at = null, locked_by = null
			where key in (select 'upscale-backdrop:' || id from title_backdrop_upscale where key = ${key})
		`);
	};

	let server: Bun.Server<undefined> | undefined;
	let sourceUrl: string;
	const request = () => upscales.request(id, sourceUrl);

	const status = async () => {
		const statuses = await statusesOf(key);

		return statuses.get(sourceUrl)?.status;
	};

	beforeAll(async () => {
		server = Bun.serve({
			fetch: () => new Response(null, { status: 404 }),
			hostname: "127.0.0.1",
			port: 0,
		});
		sourceUrl = new URL("/upscale-test.jpg", server.url).href;
		await db.insert(series).values({
			anilistId: -1,
			id,
			key,
			kind: "tv",
			laidOutAt: new Date(),
			title: "Upscale test",
		});
		await db.insert(titleArtwork).values({ key });
		await db.insert(titleImage).values({
			height: 1080,
			key,
			type: "backdrop",
			url: sourceUrl,
			voteAverage: 5,
			voteCount: 1,
			width: 1920,
		});
	}, 30_000);

	const stored = async () =>
		await db.select().from(titleBackdropUpscale).where(eq(titleBackdropUpscale.key, key));

	afterAll(async () => {
		await server?.stop(true);
	});

	test("rolls back the pending row when PostgreSQL rejects enqueue", async () => {
		await db.execute(sql`
			create function reject_upscale_enqueue() returns trigger language plpgsql as $$
			begin
				raise exception 'injected enqueue failure';
			end
			$$
		`);

		try {
			await db.execute(sql`
				create trigger reject_upscale_enqueue
				before insert or update on graphile_worker._private_jobs
				for each row execute function reject_upscale_enqueue()
			`);
			await expect(request()).rejects.toHaveProperty("cause.message", "injected enqueue failure");
			expect(await stored()).toHaveLength(0);
			expect(await jobs()).toEqual([]);

			await db.insert(titleBackdropUpscale).values({
				failure: "previous failure",
				key,
				sourceUrl,
				status: "failed",
			});
			await expect(request()).rejects.toHaveProperty("cause.message", "injected enqueue failure");
			const [failed] = await stored();
			expect(failed).toMatchObject({
				failure: "previous failure",
				status: "failed",
			});
			expect(await jobs()).toEqual([]);
		} finally {
			await db.execute(sql`drop function reject_upscale_enqueue() cascade`);
		}

		await request();
		expect(await status()).toBe("pending");
		expect(await jobs()).toHaveLength(1);
	});

	test("keeps one job across concurrent requests for a new upscale", async () => {
		await Promise.all([request(), request(), request(), request()]);
		expect(await stored()).toHaveLength(1);
		expect(await jobs()).toMatchObject([
			{
				attempts: 0,
				revision: 0,
			},
		]);
		expect(await status()).toBe("pending");
	});

	test("makes an orphan pending upscale retryable and requeues it once", async () => {
		const [orphan] = await db
			.insert(titleBackdropUpscale)
			.values({
				key,
				sourceUrl,
			})
			.returning();

		expect(await status()).toBe("failed");
		expect(await jobs()).toEqual([]);

		await Promise.all([request(), request(), request(), request()]);
		expect(await status()).toBe("pending");
		const statuses = await statusesOf(key);
		expect(statuses.get(sourceUrl)?.id).toBe(orphan?.id);
		expect(await jobs()).toMatchObject([
			{
				attempts: 0,
				revision: 0,
			},
		]);
	});

	test("keeps the running final attempt and recovers after a dead pool unlocks it", async () => {
		await request();
		await claim(new Date());
		const running = await jobs();
		expect(running).toHaveLength(1);
		expect(running[0]).toMatchObject({
			attempts: 1,
			locked_by: "pool-upscale-test",
		});
		await request();
		expect(await jobs()).toEqual(running);
		expect(await status()).toBe("pending");

		await claim(new Date(0));
		await pools.watch().stop();
		expect(await jobs()).toMatchObject([
			{
				attempts: 1,
				locked_by: null,
			},
		]);
		expect(await status()).toBe("failed");

		await Promise.all([request(), request()]);
		const recovered = await jobs();
		expect(recovered).toHaveLength(1);
		expect(recovered[0]).toMatchObject({
			attempts: 0,
			locked_by: null,
		});
		expect(await status()).toBe("pending");
	});

	test("queues a retry even while the failed job is still locked", async () => {
		await request();
		await claim(new Date());
		const [running] = await jobs();
		await db
			.update(titleBackdropUpscale)
			.set({
				failure: "previous failure",
				status: "failed",
			})
			.where(eq(titleBackdropUpscale.key, key));

		await Promise.all([request(), request()]);
		const retried = await jobs();
		expect(retried).toHaveLength(1);
		expect(retried[0]).toMatchObject({
			attempts: 0,
			locked_by: null,
		});
		expect(retried[0]?.id).not.toBe(running?.id);
		const [pending] = await stored();
		expect(pending).toMatchObject({
			failure: null,
			status: "pending",
		});
	});

	test("shows the worker's failure and lets the viewer retry after job completion", async () => {
		await request();
		const [queued] = await stored();
		await upscales.run(queued?.id ?? "");
		const [failed] = await stored();
		expect(failed).toMatchObject({
			failure: "TMDB answered 404",
			status: "failed",
		});

		await request();
		expect(await jobs()).toHaveLength(1);
		expect(await status()).toBe("pending");
	});

	test("makes an exhausted job retryable when the worker cannot save its result", async () => {
		await request();
		await db.execute(sql`
			create function reject_upscale_result() returns trigger language plpgsql as $$
			begin
				raise exception 'injected result write failure';
			end
			$$
		`);

		try {
			await db.execute(sql`
				create trigger reject_upscale_result
				before update on title_backdrop_upscale
				for each row execute function reject_upscale_result()
			`);
			const [queued] = await stored();
			// The failing write gets its own savepoint, so it cannot abort the test's transaction.
			await expect(
				db.transaction(async () => await upscales.run(queued?.id ?? "")),
			).rejects.toThrow('update "title_backdrop_upscale"');
		} finally {
			await db.execute(sql`drop function reject_upscale_result() cascade`);
		}

		const [kept] = await stored();
		expect(kept?.status).toBe("pending");
		await exhaust("injected result write failure");
		expect(await jobs()).toMatchObject([
			{
				attempts: 1,
				last_error: expect.stringContaining("injected result write failure"),
				locked_by: null,
			},
		]);
		expect(await status()).toBe("failed");

		await request();
		expect(await jobs()).toMatchObject([
			{
				attempts: 0,
				locked_by: null,
			},
		]);
		expect(await status()).toBe("pending");
	});

	test("leaves a completed upscale alone", async () => {
		await db.insert(titleBackdropUpscale).values({
			height: 2160,
			key,
			sourceUrl,
			status: "done",
		});
		await request();
		expect(await status()).toBe("done");
		expect(await jobs()).toEqual([]);
	});
});
