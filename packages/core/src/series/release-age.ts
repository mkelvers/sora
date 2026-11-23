import { day, hour, minute } from "@sora/shared";

import type { Release } from "../models/series";

/** How long ago a release came out. */
export class ReleaseAge {
	static readonly #relativeTime = new Intl.RelativeTimeFormat("en", {
		numeric: "always",
	});

	readonly #age: number;

	/** @param now - The current time, in milliseconds since the epoch. */
	constructor(releasedAt: string, now: number) {
		this.#age = Math.max(0, now - Date.parse(releasedAt));
	}

	/** How long ago the release came out, in words, and the stretch of time it falls in. */
	get fields(): Pick<Release, "released_ago" | "period"> {
		const age = this.#age;
		const relativeTime = ReleaseAge.#relativeTime;
		const minutes = Math.floor(age / minute);
		const hours = Math.floor(age / hour);
		let period: Release["period"] = "Earlier";

		if (age < day) {
			period = "Last 24 hours";
		} else if (age < 7 * day) {
			period = "This past week";
		}

		let releasedAgo = relativeTime.format(-Math.floor(age / day), "day");

		if (minutes < 60) {
			releasedAgo = relativeTime.format(-Math.max(1, minutes), "minute");
		} else if (hours < 24) {
			releasedAgo = relativeTime.format(-hours, "hour");
		}

		return {
			period,
			released_ago: releasedAgo,
		};
	}
}
