import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { HeavyWork, mustWait } from "./heavy-work";
import { PowerSupplies } from "./power-supplies";

/** A stand-in for `/sys/class/power_supply` in a temporary folder, one folder per supply. */
class FakeSupplies {
	#folder = "";

	get folder() {
		return this.#folder;
	}

	async open() {
		this.#folder = await mkdtemp(path.join(tmpdir(), "sora-power-"));
	}

	async close() {
		await rm(this.#folder, {
			force: true,
			recursive: true,
		});
	}

	async add(name: string, attributes: Record<string, string>) {
		await mkdir(path.join(this.#folder, name), {
			recursive: true,
		});

		await Promise.all(
			Object.entries(attributes).map(([attribute, value]) =>
				writeFile(path.join(this.#folder, name, attribute), `${value}\n`),
			),
		);
	}

	/** A laptop on its charger whose firmware charges the battery from 75% to 80%. */
	async laptop(capacity: number) {
		await this.add("AC", {
			online: "1",
			type: "Mains",
		});

		await this.add("BAT0", {
			capacity: String(capacity),
			charge_control_end_threshold: "80",
			charge_control_start_threshold: "75",
			status: "Not charging",
			type: "Battery",
		});
	}
}

const supplies = new FakeSupplies();

beforeEach(async () => {
	await supplies.open();
});

afterEach(async () => {
	await supplies.close();
});

describe("mustWait", () => {
	test("never waits without a battery", () => {
		expect(mustWait(null, true)).toBe(false);
	});

	test("waits without a charger, whatever the charge", () => {
		const reading = {
			capacity: 100,
			onMains: false,
			rechargeBelow: 75,
		};

		expect(mustWait(reading, false)).toBe(true);
	});

	// Running, it stops ten points below the recharge point; waiting, it goes on back there.
	test.each([
		[65, false, false],
		[64, false, true],
		[74, true, true],
		[75, true, false],
	])("at %i%% on the charger, waiting %p, must wait: %p", (capacity, waiting, expected) => {
		const reading = {
			capacity,
			onMains: true,
			rechargeBelow: 75,
		};

		expect(mustWait(reading, waiting)).toBe(expected);
	});
});

describe("PowerSupplies", () => {
	test("finds no battery where the folder is missing", async () => {
		expect(await new PowerSupplies(path.join(supplies.folder, "missing")).read()).toBeNull();
	});

	test("reads the battery, the charger and the firmware's recharge point", async () => {
		await supplies.laptop(78);

		expect(await new PowerSupplies(supplies.folder).read()).toEqual({
			capacity: 78,
			onMains: true,
			rechargeBelow: 75,
		});
	});

	test("sees a charger that is listed but offline as gone", async () => {
		await supplies.laptop(78);
		await supplies.add("AC", {
			online: "0",
		});

		const reading = await new PowerSupplies(supplies.folder).read();

		expect(reading?.onMains).toBe(false);
	});

	test("goes by the battery's status where no charger is listed", async () => {
		await supplies.add("BAT0", {
			capacity: "90",
			status: "Discharging",
			type: "Battery",
		});

		expect(await new PowerSupplies(supplies.folder).read()).toEqual({
			capacity: 90,
			onMains: false,
			rechargeBelow: 95,
		});
	});

	test("skips the batteries of devices such as a mouse", async () => {
		await supplies.add("hidpp_battery_0", {
			capacity: "20",
			scope: "Device",
			type: "Battery",
		});

		expect(await new PowerSupplies(supplies.folder).read()).toBeNull();
	});

	test("fails on a battery without a capacity rather than guessing one", async () => {
		await supplies.add("BAT0", {
			type: "Battery",
		});

		await expect(new PowerSupplies(supplies.folder).read()).rejects.toThrow("reports no capacity");
	});
});

describe("HeavyWork", () => {
	test("runs straight away without a battery", async () => {
		const work = new HeavyWork(new PowerSupplies(path.join(supplies.folder, "missing")), 20);

		expect(await work.run(["echo", "done"], 5000)).toEqual({
			code: 0,
			stderr: "",
			stdout: "done\n",
			timedOut: false,
		});
	});

	test("waits to start until the battery is back at its recharge point", async () => {
		await supplies.laptop(70);

		const work = new HeavyWork(new PowerSupplies(supplies.folder), 20);
		let settled = false;

		const finished = work.run(["echo", "done"], 5000).finally(() => {
			settled = true;
		});

		await Bun.sleep(200);

		expect(settled).toBe(false);

		await supplies.laptop(75);
		const { stdout } = await finished;

		expect(stdout).toBe("done\n");
	});

	test("pauses a running command and does not count the pause against its timeout", async () => {
		await supplies.laptop(80);

		const work = new HeavyWork(new PowerSupplies(supplies.folder), 20);
		let settled = false;

		// One process printing 1 to 5 over a quarter of a second, so a pause stops all of it.
		const finished = work
			.run(
				[
					process.execPath,
					"-e",
					"let n = 0; const t = setInterval(() => { console.log(++n); if (n === 5) clearInterval(t); }, 50);",
				],
				1000,
			)
			.finally(() => {
				settled = true;
			});

		await Bun.sleep(100);
		await supplies.laptop(60);
		await Bun.sleep(1200);

		expect(settled).toBe(false);

		await supplies.laptop(75);
		const { stdout, timedOut } = await finished;

		expect(stdout).toBe("1\n2\n3\n4\n5\n");
		expect(timedOut).toBe(false);
	});

	test("kills a command that runs past its timeout", async () => {
		const work = new HeavyWork(new PowerSupplies(path.join(supplies.folder, "missing")), 20);
		const finished = await work.run(["sleep", "5"], 100);

		expect(finished.timedOut).toBe(true);
		expect(finished.code).not.toBe(0);
	});
});
