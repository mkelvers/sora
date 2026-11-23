import type { PreparingTitle } from "../models/series";
import { scheduleSeriesStore } from "../scheduler/queue";
import { storedSeriesIds } from "./store";

/** A page of browsed entries, `perPage` places from `pageStart`, of the first `wanted` entries. */
export class BrowsePage {
	readonly #window: {
		wanted: number;
		pageStart: number;
		perPage: number;
	};

	constructor(window: { wanted: number; pageStart: number; perPage: number }) {
		this.#window = window;
	}

	/**
	 * The titles not stored yet among a page's places, where they are expected
	 * on it, described by `describe`. Entries it knows nothing about are left
	 * out.
	 */
	static preparing(
		missing: readonly {
			anilistId: number;
			place: number;
		}[],
		pageStart: number,
		perPage: number,
		describe: (anilistId: number) =>
			| (Omit<PreparingTitle, "anilist_id" | "position" | "title"> & {
					title: string | null;
			  })
			| undefined,
	): PreparingTitle[] {
		return missing.flatMap(({ anilistId, place }) => {
			const described = describe(anilistId);
			const position = place - pageStart;
			const onPage = position >= 0 && position < perPage;

			if (!described?.title || !onPage) {
				return [];
			}

			return [
				{
					...described,
					anilist_id: anilistId,
					position,
					title: described.title,
				},
			];
		});
	}

	/**
	 * Finds the stored series of each entry, and queues for the scheduler the
	 * entries among the first `wanted` that are not stored yet.
	 *
	 * The viewer is taken to be waiting on the page they asked for: entries
	 * there are laid out ahead of anything else, and those further down after
	 * airing checks. Suggestions ask for a small page, so a query typed letter
	 * by letter does not queue every faint match of each prefix ahead of new
	 * episodes.
	 *
	 * @returns Each stored entry's series, and the entries the page wanted that
	 *   are still being prepared, with their places.
	 */
	async stored(anilistIds: readonly number[]) {
		const window = this.#window;
		const found = await storedSeriesIds(anilistIds);

		const missing = anilistIds.slice(0, window.wanted).flatMap((anilistId, place) => {
			if (found.has(anilistId)) {
				return [];
			}

			return [
				{
					anilistId,
					place,
				},
			];
		});

		await Promise.all(
			missing.map(({ anilistId, place }) => {
				const isWaitedOn = place >= window.pageStart && place < window.pageStart + window.perPage;

				if (isWaitedOn) {
					return scheduleSeriesStore(anilistId, "waiting", place - window.pageStart);
				}

				return scheduleSeriesStore(anilistId, "current");
			}),
		);

		return {
			missing,
			seriesIds: found,
		};
	}
}
