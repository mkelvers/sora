import { expect, test } from "bun:test";

import { ProgressReports } from "./progress-reports";

const address = {
	episode: 1,
	profileId: "profile-a",
	seriesId: "series",
};

type Save = ConstructorParameters<typeof ProgressReports>[0];

type Settled = ConstructorParameters<typeof ProgressReports>[1];

/** Progress reports whose saves wait until a test finishes them. */
class Deferred {
	readonly writes: {
		payload: Parameters<Save>[0];
		deferred: PromiseWithResolvers<undefined>;
	}[] = [];

	readonly settlements: Parameters<Settled>[] = [];

	readonly reports = new ProgressReports(
		(payload) => {
			const deferred = Promise.withResolvers<undefined>();
			this.writes.push({
				deferred,
				payload,
			});

			return deferred.promise;
		},
		(...settlement) => this.settlements.push(settlement),
	);

	/** Reports a snapshot of a 120-second episode at `position`. */
	report = (target: typeof address, position: number, finished = false, leaving = false) => {
		this.reports.enqueue(target, {
			duration_seconds: 120,
			finished,
			leaving,
			position_seconds: position,
		});
	};

	finishWrite = async (index: number, failed = false) => {
		const { deferred } = this.writes[index];

		if (failed) {
			deferred.reject(new Error("Save failed"));
		} else {
			deferred.resolve(undefined);
		}

		await Promise.resolve();
	};
}

test("waits for the in-flight save and coalesces waiting reports to the latest position", async () => {
	const { finishWrite, report, writes } = new Deferred();

	report(address, 80);
	report(address, 90);
	report(address, 30);

	expect(writes.map(({ payload }) => payload.position_seconds)).toEqual([80]);
	await finishWrite(0);
	expect(writes.map(({ payload }) => payload.position_seconds)).toEqual([80, 30]);
	await finishWrite(1);
});

test("keeps completion and exit when later reports replace the pending position", async () => {
	const { finishWrite, report, writes } = new Deferred();

	report(address, 80);
	report(address, 120, true);
	report(address, 95, false, true);

	await finishWrite(0);
	expect(writes[1].payload).toEqual({
		...address,
		duration_seconds: 120,
		finished: true,
		leaving: true,
		position_seconds: 95,
	});
	await finishWrite(1);
});

test("sends departed episodes and profiles in order with their original flags", async () => {
	const { finishWrite, report, settlements, writes } = new Deferred();

	const nextEpisode = {
		...address,
		episode: 2,
	};

	const nextProfile = {
		...nextEpisode,
		profileId: "profile-b",
	};

	const revisited = { ...address };

	report(address, 80, true);
	report(address, 90, false, true);
	report(nextEpisode, 20, false, true);
	report(nextProfile, 25);
	report(nextProfile, 35);
	report(revisited, 15);

	await finishWrite(0, true);
	expect(settlements[0]).toEqual([address, true]);
	expect(writes[1].payload).toEqual({
		...address,
		duration_seconds: 120,
		finished: true,
		leaving: true,
		position_seconds: 90,
	});
	await finishWrite(1, true);
	expect(writes[2].payload).toEqual({
		...nextEpisode,
		duration_seconds: 120,
		finished: false,
		leaving: true,
		position_seconds: 20,
	});
	await finishWrite(2);
	expect(writes[3].payload).toEqual({
		...nextProfile,
		duration_seconds: 120,
		finished: false,
		leaving: false,
		position_seconds: 35,
	});
	await finishWrite(3);
	expect(writes[4].payload).toEqual({
		...revisited,
		duration_seconds: 120,
		finished: false,
		leaving: false,
		position_seconds: 15,
	});
	await finishWrite(4);
});

test("retains failed completion for the next report without retrying on its own", async () => {
	const { finishWrite, report, settlements, writes } = new Deferred();

	report(address, 120, true);
	await finishWrite(0, true);
	expect(writes).toHaveLength(1);
	expect(settlements).toEqual([[address, true]]);

	report(address, 90, false, true);
	expect(writes[1].payload).toEqual({
		...address,
		duration_seconds: 120,
		finished: true,
		leaving: true,
		position_seconds: 90,
	});
	await finishWrite(1);
	expect(settlements).toEqual([
		[address, true],
		[address, false],
	]);
});
