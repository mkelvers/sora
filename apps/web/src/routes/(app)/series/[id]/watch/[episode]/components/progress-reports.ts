import { attempt } from "@sora/shared";

/** The episode and profile captured when a playback session starts. */
export interface ProgressAddress {
	readonly episode: number;
	readonly profileId: string;
	readonly seriesId: string;
}

export interface ProgressSnapshot {
	duration_seconds: number;
	finished: boolean;
	position_seconds: number;
}

type Report = ProgressSnapshot & { leaving: boolean };

const mergeReports = (latest: Report, earlier?: Report): Report => ({
	...latest,
	finished: latest.finished || (earlier?.finished ?? false),
	leaving: latest.leaving || (earlier?.leaving ?? false),
});

/** Sends one snapshot at a time for a mounted player, including across episode changes. */
export class ProgressReports {
	readonly #pending: {
		address: ProgressAddress;
		report: Report;
	}[] = [];
	readonly #save: (input: ProgressAddress & Report) => Promise<void>;
	readonly #settled: (address: ProgressAddress, failed: boolean) => void;
	#failed?: {
		address: ProgressAddress;
		report: Report;
	};
	#saving = false;

	constructor(
		save: (input: ProgressAddress & Report) => Promise<void>,
		settled: (address: ProgressAddress, failed: boolean) => void,
	) {
		this.#save = save;
		this.#settled = settled;
	}

	/**
	 * Use the same address object for one playback session. Pending positions follow
	 * report order, with completion and exit carried until a save succeeds.
	 */
	enqueue(address: ProgressAddress, report: Report) {
		const pending = this.#pending.at(-1);

		if (pending?.address === address) {
			pending.report = mergeReports(report, pending.report);
		} else {
			this.#pending.push({
				address,
				report,
			});
		}

		if (!this.#saving) {
			void this.#drain();
		}
	}

	async #drain() {
		const next = this.#pending.shift();

		if (!next) {
			this.#saving = false;

			return;
		}

		this.#saving = true;
		const { address, report } = next;
		const retry = this.#failed?.address === address ? this.#failed.report : undefined;
		const merged = mergeReports(report, retry);

		const { error } = await attempt(
			this.#save({
				...address,
				...merged,
			}),
		);

		this.#failed = error
			? {
					address,
					report: merged,
				}
			: undefined;
		this.#settled(address, error !== null);
		await this.#drain();
	}
}
