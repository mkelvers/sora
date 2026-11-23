import { and, eq, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { anikotoSeries, providerMapping } from "../../database/schema/playback";

/** Series of AniKoto's catalogue, as the mirror stores them. */
export class Rows {
	/** The ID AniKoto's mappings are stored under in `provider_mapping`. */
	static readonly provider = "anikoto";

	readonly #rows: (typeof anikotoSeries.$inferInsert)[];

	constructor(rows: (typeof anikotoSeries.$inferInsert)[]) {
		this.#rows = rows;
	}

	/** Stores the series in the mirror; returns how many were stored. */
	async store() {
		const rows = this.#rows;

		if (rows.length === 0) {
			return 0;
		}

		await db
			.insert(anikotoSeries)
			.values(rows)
			.onConflictDoUpdate({
				set: {
					anilistId: sql`excluded.anilist_id`,
					episodes: sql`excluded.episodes`,
					format: sql`excluded.format`,
					malId: sql`excluded.mal_id`,
					rating: sql`excluded.rating`,
					title: sql`excluded.title`,
					titles: sql`excluded.titles`,
					updatedAt: sql`excluded.updated_at`,
					year: sql`excluded.year`,
				},
				target: anikotoSeries.anikotoId,
			});
		await this.#dropContradicted();

		return rows.length;
	}

	/**
	 * Drops the stored mappings that the series now contradict: an AniList
	 * entry mapped to one series while another names it, and the mapped one
	 * names a different entry. A mapped series that names none is kept, since
	 * AniKoto may have split one title across several series. AniKoto files a
	 * split-cour or later stage under a series of its own after the first
	 * mapping was made (Steel Ball Run 2nd - 3rd STAGE stayed on its 1-episode
	 * first stage for a month), and a stored match is otherwise trusted for 30
	 * days. The next look finds the entry again.
	 */
	async #dropContradicted() {
		const named = this.#rows.flatMap((row) => {
			if (row.anilistId === null || row.anilistId === undefined) {
				return [];
			}

			return [sql`(${row.anilistId}::int, ${String(row.anikotoId)}::text)`];
		});

		if (named.length === 0) {
			return;
		}

		await db.delete(providerMapping).where(
			and(
				eq(providerMapping.provider, Rows.provider),
				sql`exists (
        select 1 from (values ${sql.join(named, sql`, `)}) as named(anilist_id, anikoto_id)
        where named.anilist_id = ${providerMapping.anilistId}
          and named.anikoto_id <> ${providerMapping.providerMediaId}
      )`,
				sql`exists (
        select 1 from ${anikotoSeries}
        where ${anikotoSeries.anikotoId}::text = ${providerMapping.providerMediaId}
          and ${anikotoSeries.anilistId} is not null
          and ${anikotoSeries.anilistId} <> ${providerMapping.anilistId}
      )`,
			),
		);
	}
}
