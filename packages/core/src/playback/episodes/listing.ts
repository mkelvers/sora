import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../database/client";
import { episodeDub, providerEpisodes } from "../../database/schema/playback";
import { LanguageSchema } from "../../models/series";
import type { ProviderEpisode } from "../providers/provider";

/**
 * A stored list that does not match this, such as one stored before a field
 * was added, is fetched again rather than served.
 */
export const ProviderUnitsSchema = z.array(
	z.object({
		id: z.string(),
		isFiller: z.boolean().nullable(),
		languages: z.array(LanguageSchema).nullable(),
		number: z.number(),
		title: z.string(),
	}),
);

/** One provider's stored episode list of one anime. */
export class Listing {
	readonly #anilistId: number;
	readonly #provider: string;

	constructor(anilistId: number, provider: string) {
		this.#anilistId = anilistId;
		this.#provider = provider;
	}

	/** The stored list; `null` when none is stored or it is outdated. */
	async stored() {
		const [stored] = await db
			.select({
				units: providerEpisodes.units,
			})
			.from(providerEpisodes)
			.where(
				and(
					eq(providerEpisodes.anilistId, this.#anilistId),
					eq(providerEpisodes.provider, this.#provider),
				),
			)
			.limit(1);

		if (!stored) {
			return null;
		}

		const units = ProviderUnitsSchema.safeParse(stored.units);

		if (units.success) {
			return units.data;
		}

		return null;
	}

	/**
	 * Records the dubs in AniKoto's episode list of an anime that are not
	 * recorded yet, before the list replaces `previous`, the stored one.
	 *
	 * A dub that appeared on an episode the stored list already had came out
	 * now. One nobody saw come out has no time: the list is the first stored
	 * for the anime, or the dub arrived together with its episode, which the
	 * episode coming out already tells.
	 */
	async recordDubs(
		units: readonly ProviderEpisode[],
		previous: readonly ProviderEpisode[] | null,
		now: Date,
	) {
		const dubbed = units.filter(
			(unit) => Number.isInteger(unit.number) && unit.languages?.includes("dub"),
		);

		if (dubbed.length === 0) {
			return;
		}

		const recorded = await db
			.select({
				episode: episodeDub.episode,
			})
			.from(episodeDub)
			.where(eq(episodeDub.anilistId, this.#anilistId));

		const known = new Set(recorded.map((row) => row.episode));
		const carried = new Set(previous?.map((unit) => unit.number));

		const fresh = dubbed.filter((unit) => !known.has(unit.number));

		if (fresh.length > 0) {
			await db
				.insert(episodeDub)
				.values(
					fresh.map((unit) => {
						let releasedAt: Date | null = null;

						if (carried.has(unit.number)) {
							releasedAt = now;
						}

						return {
							anilistId: this.#anilistId,
							episode: unit.number,
							releasedAt,
						};
					}),
				)
				.onConflictDoNothing();
		}
	}
}
