import { and, eq, inArray } from "drizzle-orm";

import type { MediaFormat, MediaStatus } from "../anilist/graphql.generated";
import { formatAllowed, catalogSeriesAllowed } from "../catalog/visibility";
import { db } from "../database/client";
import { animeSearch } from "../database/schema/catalog";
import { series } from "../database/schema/series";
import { isNamedAfter } from "./franchise";
import { byStartDate, franchiseIds } from "./queries";

/** Where catching up on an AniList entry's franchise starts. */
export class CatchUp {
	/** What a franchise starts with: a show or a film, rather than a special or an OVA. */
	static readonly #openingFormats = new Set<MediaFormat>(["TV", "MOVIE"]);

	readonly #anilistId: number;

	constructor(anilistId: number) {
		this.#anilistId = anilistId;
	}

	/**
	 * The title of the franchise to start catching up on: the earliest show or
	 * film that is out, or the earliest of anything out when none is. `null`
	 * when nothing of the franchise is out.
	 */
	async start() {
		/** The statuses of a title that is out. */
		const released: MediaStatus[] = ["FINISHED", "RELEASING"];

		const { ids: franchise, crossovers, apart } = await franchiseIds(this.#anilistId);

		if (franchise.length === 0) {
			return null;
		}

		const rows = await db
			.select({
				format: animeSearch.format,
				series,
			})
			.from(series)
			.leftJoin(animeSearch, eq(animeSearch.anilistId, series.anilistId))
			.where(
				and(
					inArray(series.anilistId, franchise),
					inArray(series.status, released),
					formatAllowed(animeSearch.format),
					catalogSeriesAllowed,
				),
			);

		const earliestOf = (candidates: typeof rows) => {
			const opening = candidates.filter(
				(row) => row.format !== null && CatchUp.#openingFormats.has(row.format),
			);

			let chosen = candidates;

			if (opening.length > 0) {
				chosen = opening;
			}

			return byStartDate(chosen.map((row) => row.series))[0];
		};

		// A crossover shares the universe, not the story, so catching up never
		// starts there unless the franchise's own earliest title is named after it.
		// A title reached only across a spin-off tells another story, and never does.
		const own = rows.filter(
			(row) => !crossovers.has(row.series.anilistId) && !apart.has(row.series.anilistId),
		);

		let pool = rows;

		if (own.length > 0) {
			pool = own;
		}

		const start = earliestOf(pool);

		if (!start) {
			return null;
		}

		const named = rows.filter(
			(row) => crossovers.has(row.series.anilistId) && isNamedAfter(start.title, row.series.title),
		);

		if (named.length > 0) {
			return earliestOf([...own, ...named]) ?? null;
		}

		return start;
	}
}
