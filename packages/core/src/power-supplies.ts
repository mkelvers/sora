import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { attempt } from "@sora/shared";

/** The machine's battery and whether a charger feeds it. */
export interface PowerReading {
	/** The charge left, in percent. */
	capacity: number;
	/** Whether a charger is connected. */
	onMains: boolean;
	/**
	 * The charge, in percent, below which the battery's firmware starts
	 * charging it: `charge_control_start_threshold`, else 5 below
	 * `charge_control_end_threshold` or a full battery.
	 */
	rechargeBelow: number;
}

/** The power supplies Linux lists in a folder such as `/sys/class/power_supply`. */
export class PowerSupplies {
	readonly #folder: string;

	constructor(folder: string) {
		this.#folder = folder;
	}

	/**
	 * The machine's battery: the first supply, by name, of type `Battery`
	 * that powers the system rather than a device such as a mouse. `null`
	 * when the folder is missing, as off Linux, or lists no such battery. The
	 * charger counts as connected when a `Mains` or `USB` supply is online or,
	 * where none is listed, when the battery is not discharging.
	 *
	 * @throws {Error} when the battery reports no capacity or a file cannot be read.
	 */
	async read(): Promise<PowerReading | null> {
		const { data: names, error } = await attempt(readdir(this.#folder));

		if (error) {
			if (PowerSupplies.#isMissing(error)) {
				return null;
			}

			throw error;
		}

		const supplies = await Promise.all(
			names.toSorted().map(async (name) => {
				const folder = path.join(this.#folder, name);

				const [type, online, scope] = await Promise.all([
					PowerSupplies.#value(folder, "type"),
					PowerSupplies.#value(folder, "online"),
					PowerSupplies.#value(folder, "scope"),
				]);

				return {
					folder,
					online,
					scope,
					type,
				};
			}),
		);

		const chargers = supplies.filter((supply) => supply.type === "Mains" || supply.type === "USB");

		const battery = supplies.find(
			(supply) => supply.type === "Battery" && supply.scope !== "Device",
		);

		if (!battery) {
			return null;
		}

		const [charge, status, start, end] = await Promise.all([
			PowerSupplies.#value(battery.folder, "capacity"),
			PowerSupplies.#value(battery.folder, "status"),
			PowerSupplies.#value(battery.folder, "charge_control_start_threshold"),
			PowerSupplies.#value(battery.folder, "charge_control_end_threshold"),
		]);

		const capacity = Number(charge);
		const hasCapacity = charge !== null && charge !== "" && Number.isFinite(capacity);

		if (!hasCapacity) {
			throw new Error(`${battery.folder} reports no capacity`);
		}

		let onMains = status !== "Discharging";

		if (chargers.length > 0) {
			onMains = chargers.some((charger) => charger.online === "1");
		}

		let rechargeBelow = 95;

		if (Number(start) > 0) {
			rechargeBelow = Number(start);
		} else if (Number(end) > 0) {
			rechargeBelow = Number(end) - 5;
		}

		return {
			capacity,
			onMains,
			rechargeBelow,
		};
	}

	/** A supply's attribute, trimmed, or `null` when the supply does not report it. */
	static async #value(supply: string, attribute: string) {
		const { data, error } = await attempt(readFile(path.join(supply, attribute), "utf-8"));

		if (error) {
			if (PowerSupplies.#isMissing(error)) {
				return null;
			}

			throw error;
		}

		return data.trim();
	}

	static #isMissing(error: Error) {
		return "code" in error && error.code === "ENOENT";
	}
}
