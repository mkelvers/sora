import { expect, test } from "bun:test";

import { ProgressReports } from "./progress-reports";

const address = { episode: 1, profileId: "profile-a", seriesId: "series" };
const snapshot = (position: number, finished = false, leaving = false) => ({
	duration_seconds: 120,
	finished,
	leaving,
	position_seconds: position,
});

type Save = ConstructorParameters<typeof ProgressReports>[0];
type Settled = ConstructorParameters<typeof ProgressReports>[1];

const deferredReports = () => {
	const writes: {
		payload: Parameters<Save>[0];
		deferred: PromiseWithResolvers<undefined>;
	}[] = [];
	const settlements: Parameters<Settled>[] = [];
	const reports = new ProgressReports(
		(payload) => {
			const deferred = Promise.withResolvers<undefined>();
			writes.push({ deferred, payload });
			return deferred.promise;
		},
		(...settlement) => settlements.push(settlement),
	);

	const finishWrite = async (index: number, failed = false) => {
		const { deferred } = writes[index];
		if (failed) {
			deferred.reject(new Error("Save failed"));
		} else {
			deferred.resolve(undefined);
		}
		await Promise.resolve();
	};

	return { finishWrite, reports, settlements, writes };
};

test("waits for the in-flight save and coalesces waiting reports to the latest position", async () => {
	const { finishWrite, reports, writes } = deferredReports();

	reports.enqueue(address, snapshot(80));
	reports.enqueue(address, snapshot(90));
	reports.enqueue(address, snapshot(30));

	expect(writes.map(({ payload }) => payload.position_seconds)).toEqual([80]);
	await finishWrite(0);
	expect(writes.map(({ payload }) => payload.position_seconds)).toEqual([80, 30]);
	await finishWrite(1);
});

test("keeps completion and exit when later reports replace the pending position", async () => {
	const { finishWrite, reports, writes } = deferredReports();

	reports.enqueue(address, snapshot(80));
	reports.enqueue(address, snapshot(120, true));
	reports.enqueue(address, snapshot(95, false, true));

	await finishWrite(0);
	expect(writes[1].payload).toEqual({ ...address, ...snapshot(95, true, true) });
	await finishWrite(1);
});

test("sends departed episodes and profiles in order with their original flags", async () => {
	const { finishWrite, reports, settlements, writes } = deferredReports();
	const nextEpisode = { ...address, episode: 2 };
	const nextProfile = { ...nextEpisode, profileId: "profile-b" };
	const revisited = { ...address };

	reports.enqueue(address, snapshot(80, true));
	reports.enqueue(address, snapshot(90, false, true));
	reports.enqueue(nextEpisode, snapshot(20, false, true));
	reports.enqueue(nextProfile, snapshot(25));
	reports.enqueue(nextProfile, snapshot(35));
	reports.enqueue(revisited, snapshot(15));

	await finishWrite(0, true);
	expect(settlements[0]).toEqual([address, true]);
	expect(writes[1].payload).toEqual({ ...address, ...snapshot(90, true, true) });
	await finishWrite(1, true);
	expect(writes[2].payload).toEqual({ ...nextEpisode, ...snapshot(20, false, true) });
	await finishWrite(2);
	expect(writes[3].payload).toEqual({ ...nextProfile, ...snapshot(35) });
	await finishWrite(3);
	expect(writes[4].payload).toEqual({ ...revisited, ...snapshot(15) });
	await finishWrite(4);
});

test("retains failed completion for the next report without retrying on its own", async () => {
	const { finishWrite, reports, settlements, writes } = deferredReports();

	reports.enqueue(address, snapshot(120, true));
	await finishWrite(0, true);
	expect(writes).toHaveLength(1);
	expect(settlements).toEqual([[address, true]]);

	reports.enqueue(address, snapshot(90, false, true));
	expect(writes[1].payload).toEqual({ ...address, ...snapshot(90, true, true) });
	await finishWrite(1);
	expect(settlements).toEqual([
		[address, true],
		[address, false],
	]);
});
