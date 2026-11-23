/**
 * A day as AniList or MyAnimeList spell it, which may lack the month or the day
 * (a year alone is a valid date on both). A missing part counts as the first;
 * a year of `0000` is MyAnimeList's way of saying there is none.
 */
export class CalendarDay {
	readonly #year: number | null | undefined;
	readonly #month: number | null | undefined;
	readonly #day: number | null | undefined;

	constructor(year?: number | null, month?: number | null, day?: number | null) {
		this.#year = year;
		this.#month = month;
		this.#day = day;
	}

	/** The day at midnight UTC; `null` without a year. */
	get date(): Date | null {
		if (this.#year) {
			return new Date(Date.UTC(this.#year, (this.#month || 1) - 1, this.#day || 1));
		}

		return null;
	}
}
