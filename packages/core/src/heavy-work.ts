import { attempt, second } from "@sora/shared";
import type { Subprocess } from "bun";

import { PowerSupplies } from "./power-supplies";
import type { PowerReading } from "./power-supplies";

/** How a command run by {@link HeavyWork.run} ended. */
export interface Finished {
	/** The exit code, or 128 plus the signal's number when a signal ended it. */
	code: number;
	stderr: string;
	stdout: string;
	/** Whether it ran longer than its timeout and was killed. */
	timedOut: boolean;
}

/** A command that is running, and how long it has run, not counting pauses. */
interface Running {
	child: Subprocess<"ignore", "pipe", "pipe">;
	ranMs: number;
	timedOut: boolean;
	timeoutMs: number;
}

/**
 * Whether heavy work must wait, given the battery and whether it waits now.
 * It waits while no charger is connected, and from when the charge falls
 * `drawDown` points below where the firmware starts recharging until it is
 * back there. So heavy work may draw more than the charger delivers by
 * spending a slice of the battery, and never more than that slice. `null`
 * means the machine has no battery, and nothing waits.
 */
export const mustWait = (reading: PowerReading | null, waiting: boolean) => {
	/** How far below its recharge point heavy work may run the battery down, in percent. */
	const drawDown = 10;

	if (!reading) {
		return false;
	}

	if (!reading.onMains) {
		return true;
	}

	if (waiting) {
		return reading.capacity < reading.rechargeBelow;
	}

	return reading.capacity < reading.rechargeBelow - drawDown;
};

/**
 * Runs commands that keep every processor busy for minutes, such as
 * upscaling a backdrop or transcribing a dub, only while the machine's power
 * can carry them. On a laptop whose charger delivers less than such a command
 * draws, the battery makes up the rest until it is empty and the machine
 * dies. So a command waits to start, and pauses while it runs, whenever
 * {@link mustWait} says so; a paused command keeps its progress and goes on
 * where it stopped.
 *
 * Where there is no battery, commands run straight away and never pause.
 * Every command shares one battery, so one pause stops them all.
 */
export class HeavyWork {
	readonly #checkEveryMs: number;
	readonly #running = new Set<Running>();
	readonly #supplies: PowerSupplies;
	/** Starts out waiting, so a scheduler started on a drained battery lets it charge first. */
	#waiting = true;
	#watching = false;

	constructor(supplies: PowerSupplies, checkEveryMs: number) {
		this.#supplies = supplies;
		this.#checkEveryMs = checkEveryMs;
	}

	/**
	 * Runs `command` once the power allows it, pausing it whenever the power
	 * no longer does, and kills it once it has run for `timeoutMs`, not
	 * counting pauses. Resolves when it exits, whatever its exit code.
	 */
	async run(command: string[], timeoutMs: number): Promise<Finished> {
		await this.#untilPowered();

		const running: Running = {
			child: Bun.spawn(command, {
				stderr: "pipe",
				stdin: "ignore",
				stdout: "pipe",
			}),
			ranMs: 0,
			timedOut: false,
			timeoutMs,
		};

		this.#running.add(running);

		if (!this.#watching) {
			this.#watching = true;
			this.#watch(performance.now());
		}

		try {
			const [stdout, stderr, code] = await Promise.all([
				new Response(running.child.stdout).text(),
				new Response(running.child.stderr).text(),
				running.child.exited,
			]);

			return {
				code,
				stderr,
				stdout,
				timedOut: running.timedOut,
			};
		} finally {
			this.#running.delete(running);
		}
	}

	/** Settles once heavy work may run, checking the power every `checkEveryMs` until then. */
	async #untilPowered(): Promise<void> {
		await this.#check();

		if (!this.#waiting) {
			return;
		}

		await Bun.sleep(this.#checkEveryMs);

		return await this.#untilPowered();
	}

	/**
	 * Checks the power every `checkEveryMs` while any command runs, counts
	 * how long each has run since `since`, and kills those past their
	 * timeout. Stops once none runs; `#watching` is cleared in the same step
	 * that sees none left, so a command started after that starts a new watch.
	 */
	async #watch(since: number): Promise<void> {
		if (this.#running.size === 0) {
			this.#watching = false;

			return;
		}

		await Bun.sleep(this.#checkEveryMs);

		const now = performance.now();

		if (!this.#waiting) {
			for (const running of this.#running) {
				running.ranMs += now - since;
			}
		}

		await this.#check();

		for (const running of this.#running) {
			const isOverdue = running.ranMs > running.timeoutMs && !running.timedOut;

			if (isOverdue) {
				running.timedOut = true;
				running.child.kill("SIGKILL");
			}
		}

		return await this.#watch(now);
	}

	/**
	 * Reads the battery and, when that changes whether heavy work must wait,
	 * pauses or resumes every running command. A battery that cannot be read
	 * leaves things as they are.
	 */
	async #check() {
		const { data: reading, error } = await attempt(this.#supplies.read());

		if (error) {
			console.warn(`Could not read the battery: ${error.message}`);

			return;
		}

		const waiting = mustWait(reading, this.#waiting);

		if (waiting === this.#waiting) {
			return;
		}

		this.#waiting = waiting;

		for (const running of this.#running) {
			if (waiting) {
				running.child.kill("SIGSTOP");
			} else {
				running.child.kill("SIGCONT");
			}
		}

		if (!reading) {
			return;
		}

		if (!waiting) {
			console.info(`Heavy work goes on: battery at ${reading.capacity}%`);
		} else if (reading.onMains) {
			console.info(
				`Heavy work waits: battery at ${reading.capacity}%, goes on at ${reading.rechargeBelow}%`,
			);
		} else {
			console.info("Heavy work waits: no charger connected");
		}
	}
}

/** The one runner every heavy command goes through, so they share one view of the battery. */
export const heavyWork = new HeavyWork(new PowerSupplies("/sys/class/power_supply"), 15 * second);
