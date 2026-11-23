import type { series } from "../database/schema/series";
import type { EpisodeListingRow, AniKotoEpisodes } from "./episodes";
import { isAvailable } from "./episodes";

/** Which episodes some titles list, given what AniKoto carries of them. */
export class Listing {
	readonly #titles: readonly (typeof series.$inferSelect)[];
	readonly #onAniKoto: AniKotoEpisodes;

	constructor(titles: readonly (typeof series.$inferSelect)[], onAniKoto: AniKotoEpisodes) {
		this.#titles = titles;
		this.#onAniKoto = onAniKoto;
	}

	/** The rows each title lists (see {@link isAvailable}), grouped by series ID. */
	keep<TRow extends EpisodeListingRow & { seriesId: string }>(rows: readonly TRow[]) {
		const now = new Date();
		const grouped = Map.groupBy(rows, (row) => row.seriesId);

		return new Map(
			this.#titles.map((title) => [
				title.id,
				(grouped.get(title.id) ?? []).filter((row) =>
					isAvailable(title, row, this.#onAniKoto, now),
				),
			]),
		);
	}
}
