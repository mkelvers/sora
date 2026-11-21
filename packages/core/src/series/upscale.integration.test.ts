import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";
import { runOnce } from "graphile-worker";

import { config } from "../config";
import { db, migrateDatabase } from "../database/client";
import { series, titleArtwork, titleBackdropUpscale, titleImage } from "../database/schema/series";
import { upscaleBackdropJob } from "../scheduler/jobs/upscale";
import { failInvalidPayloads } from "../scheduler/payload";
import { watchPools } from "../scheduler/pools";
import { upscaleBackdropTask } from "../scheduler/queue";
import { requestBackdropUpscale, upscalesOf } from "./upscale";

const disposableDatabase = /^\/sora_upscale_test_[a-f0-9]{32}$/u;

const jobs = async () => {
	const rows = await db.execute<{
		attempts: number;
		id: string;
		last_error: string | null;
		locked_by: string | null;
		revision: number;
	}>(sql`
		select attempts, id::text, last_error, locked_by, revision from graphile_worker.jobs
		where task_identifier = ${upscaleBackdropTask} and key is not null
	`);
	return [...rows];
};
const claim = async (lockedAt: Date) => {
	const lockedBy = "pool-upscale-test";
	const timestamp = lockedAt.toISOString();
	await db.execute(sql`
		update graphile_worker._private_jobs
		set attempts = max_attempts, locked_at = ${timestamp}::timestamptz, locked_by = ${lockedBy}
		where key like 'upscale-backdrop:%'
	`);
	await db.execute(sql`
		update graphile_worker._private_job_queues
		set locked_at = ${timestamp}::timestamptz, locked_by = ${lockedBy}
		where queue_name = 'upscale-backdrop'
	`);
};
const runUpscale = async () =>
	await runOnce({
		connectionString: config.databaseUrl,
		taskList: failInvalidPayloads({ [upscaleBackdropTask]: upscaleBackdropJob }),
	});

describe.skipIf(process.env.SORA_UPSCALE_INTEGRATION !== "1")("backdrop upscale queue", () => {
	const key = "tv:1";
	const seriesId = "upscale-test";
	let server: Bun.Server<undefined> | undefined;
	let sourceUrl: string;
	const request = () => requestBackdropUpscale(seriesId, sourceUrl);
	const status = async () => {
		const upscales = await upscalesOf(key);
		return upscales.get(sourceUrl)?.status;
	};

	beforeAll(async () => {
		if (!disposableDatabase.test(new URL(config.databaseUrl).pathname)) {
			throw new Error("Use a dedicated empty sora_upscale_test_<uuid without hyphens> database");
		}
		const [connected] = await db.execute<{ name: string }>(sql`select current_database() as name`);
		if (!disposableDatabase.test(`/${connected?.name}`)) {
			throw new Error("The PostgreSQL connection must use the disposable database");
		}
		await migrateDatabase();
		server = Bun.serve({
			fetch: () => new Response(null, { status: 404 }),
			hostname: "127.0.0.1",
			port: 0,
		});
		sourceUrl = new URL("/upscale-test.jpg", server.url).href;
		await db.insert(series).values({
			anilistId: -1,
			id: seriesId,
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

	afterAll(async () => {
		await server?.stop(true);
	});

	beforeEach(async () => {
		await db.execute(sql`
			truncate title_backdrop_upscale, graphile_worker._private_jobs, graphile_worker._private_job_queues
		`);
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
			expect(await db.select().from(titleBackdropUpscale)).toHaveLength(0);
			expect(await jobs()).toEqual([]);

			await db.insert(titleBackdropUpscale).values({
				failure: "previous failure",
				key,
				sourceUrl,
				status: "failed",
			});
			await expect(request()).rejects.toHaveProperty("cause.message", "injected enqueue failure");
			const [failed] = await db.select().from(titleBackdropUpscale);
			expect(failed).toMatchObject({ failure: "previous failure", status: "failed" });
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
		expect(await db.select().from(titleBackdropUpscale)).toHaveLength(1);
		expect(await jobs()).toMatchObject([{ attempts: 0, revision: 0 }]);
		expect(await status()).toBe("pending");
	});

	test("makes an orphan pending upscale retryable and requeues it once", async () => {
		const [orphan] = await db.insert(titleBackdropUpscale).values({ key, sourceUrl }).returning();
		expect(await status()).toBe("failed");
		expect(await jobs()).toEqual([]);

		await Promise.all([request(), request(), request(), request()]);
		expect(await status()).toBe("pending");
		const upscales = await upscalesOf(key);
		expect(upscales.get(sourceUrl)?.id).toBe(orphan?.id);
		expect(await jobs()).toMatchObject([{ attempts: 0, revision: 0 }]);
	});

	test("keeps the running final attempt and recovers after a dead pool unlocks it", async () => {
		await request();
		await claim(new Date());
		const running = await jobs();
		expect(running).toHaveLength(1);
		expect(running[0]).toMatchObject({ attempts: 1, locked_by: "pool-upscale-test" });
		await request();
		expect(await jobs()).toEqual(running);
		expect(await status()).toBe("pending");

		await claim(new Date(0));
		await watchPools().stop();
		expect(await jobs()).toMatchObject([{ attempts: 1, locked_by: null }]);
		expect(await status()).toBe("failed");

		await Promise.all([request(), request()]);
		const recovered = await jobs();
		expect(recovered).toHaveLength(1);
		expect(recovered[0]).toMatchObject({ attempts: 0, locked_by: null });
		expect(await status()).toBe("pending");
	});

	test("queues a retry even while the failed job is still locked", async () => {
		await request();
		await claim(new Date());
		const [running] = await jobs();
		await db.update(titleBackdropUpscale).set({ failure: "previous failure", status: "failed" });

		await Promise.all([request(), request()]);
		const retried = await jobs();
		expect(retried).toHaveLength(1);
		expect(retried[0]).toMatchObject({ attempts: 0, locked_by: null });
		expect(retried[0]?.id).not.toBe(running?.id);
		const [pending] = await db.select().from(titleBackdropUpscale);
		expect(pending).toMatchObject({ failure: null, status: "pending" });
	});

	test("shows the worker's failure and lets the viewer retry after job completion", async () => {
		await request();
		await runUpscale();
		const [failed] = await db.select().from(titleBackdropUpscale);
		expect(failed).toMatchObject({ failure: "TMDB answered 404", status: "failed" });
		expect(await jobs()).toEqual([]);

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
			await runUpscale();
		} finally {
			await db.execute(sql`drop function reject_upscale_result() cascade`);
		}
		const [stored] = await db.select().from(titleBackdropUpscale);
		expect(stored?.status).toBe("pending");
		expect(await jobs()).toMatchObject([
			{
				attempts: 1,
				last_error: expect.stringContaining("injected result write failure"),
				locked_by: null,
			},
		]);
		expect(await status()).toBe("failed");

		await request();
		expect(await jobs()).toMatchObject([{ attempts: 0, locked_by: null }]);
		expect(await status()).toBe("pending");
	});

	test("leaves a completed upscale alone", async () => {
		await db.insert(titleBackdropUpscale).values({ height: 2160, key, sourceUrl, status: "done" });
		await request();
		expect(await status()).toBe("done");
		expect(await jobs()).toEqual([]);
	});
});
