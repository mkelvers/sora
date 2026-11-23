import { inArray } from "drizzle-orm";

import { db } from "../../database/client";
import { series } from "../../database/schema/series";
import type { SeriesCard } from "../../models/series";
import { toCards } from "../../series/queries";

/** The cards of stored series, by series ID. */
export class Cards {
	readonly #cards: Map<string, SeriesCard>;

	constructor(cards: Map<string, SeriesCard>) {
		this.#cards = cards;
	}

	/** Loads the cards of the stored series among `seriesIds`. */
	static async load(seriesIds: readonly string[]): Promise<Cards> {
		if (seriesIds.length > 0) {
			const rows = await db
				.select()
				.from(series)
				.where(inArray(series.id, [...seriesIds]));

			return new Cards(await toCards(rows));
		}

		return new Cards(new Map());
	}

	get(id: string): SeriesCard | undefined {
		return this.#cards.get(id);
	}

	/** Whether a title can lead the home page: it has a backdrop and logo to draw, and something streams it. */
	showable(id: string): boolean {
		const card = this.#cards.get(id);

		return card !== undefined && !!card.backdrop_url && !!card.logo_url && card.audio.length > 0;
	}
}
