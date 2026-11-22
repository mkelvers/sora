import { z } from "zod";

/** One entry of AnimeSchedule's timetable. */
export class Entry {
	/** One release in AnimeSchedule's timetable, as far as it is read. */
	static readonly schema = z.object({
		airType: z.enum(["raw", "sub", "dub"]),
		airingStatus: z.string(),
		/** When the hold starts and ends; `0001-01-01T00:00:00Z` when not known. */
		delayedFrom: z.iso
			.datetime({
				offset: true,
			})
			.optional(),
		/** Set, as `Delayed` or `Break`, while the episode is held back; see {@link Entry.heldBack}. */
		delayedText: z.string().optional(),
		delayedUntil: z.iso
			.datetime({
				offset: true,
			})
			.optional(),
		/** Whether the show is a Chinese animation, which AnimeSchedule files apart from anime. */
		donghua: z.boolean().optional(),
		episodeDate: z.iso.datetime({
			offset: true,
		}),
		episodeNumber: z.number().int().positive(),
		/** The length of an episode in minutes; absent or 0 when not known. */
		lengthMin: z.number().int().nonnegative().nullish(),
		route: z.string().min(1),
		/** How many episodes before `episodeNumber` come out with it, as in a double-episode premiere. */
		subtractedEpisodeNumber: z.number().int().nonnegative().optional(),
	});

	/** A date AnimeSchedule sends for one it does not know. */
	static readonly #unknownDate = "0001-01-01T00:00:00Z";

	readonly #entry: z.infer<typeof Entry.schema>;

	constructor(entry: z.infer<typeof Entry.schema>) {
		this.#entry = entry;
	}

	/**
	 * Whether the entry is held back rather than coming out when listed. The
	 * timetable keeps a delayed episode in each week until it airs, marked
	 * `delayed-air` in the week it was due and only by `delayedText` in the
	 * weeks between, so a listed time within the hold is not when it airs.
	 */
	get heldBack(): boolean {
		const entry = this.#entry;

		if (entry.airingStatus === "delayed-air") {
			return true;
		}

		if (!entry.delayedText) {
			return false;
		}

		const airsAt = Date.parse(entry.episodeDate);
		const from = this.#known("delayedFrom");
		const until = this.#known("delayedUntil");

		return (from === null || airsAt >= from) && (until === null || airsAt < until);
	}

	/** The time of a hold's start or end, or `null` when AnimeSchedule does not know it. */
	#known(bound: "delayedFrom" | "delayedUntil"): number | null {
		const date = this.#entry[bound];

		if (!date || date === Entry.#unknownDate) {
			return null;
		}

		return Date.parse(date);
	}
}
