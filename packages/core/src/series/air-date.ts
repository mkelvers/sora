/** A `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` date, or none. Only full dates are compared day by day. */
export class AirDate {
	readonly #date: string | null;

	constructor(date: string | null) {
		this.#date = date;
	}

	/** Days since the Unix epoch for a full date; partial dates yield `null`. */
	get day(): number | null {
		if (!this.#date) {
			return null;
		}

		const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/u.exec(this.#date);

		if (!match) {
			return null;
		}

		return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
	}

	get year(): number | null {
		if (!this.#date) {
			return null;
		}

		const match = /^(?<year>\d{4})/u.exec(this.#date);

		if (match) {
			return Number(match[1]);
		}

		return null;
	}

	/** How many days apart this and `other` are, or `null` unless both are full dates. */
	offset(other: string | null): number | null {
		const { day } = this;
		const otherDay = new AirDate(other).day;

		if (day !== null && otherDay !== null) {
			return Math.abs(day - otherDay);
		}

		return null;
	}

	/** Whether this is before `other`; an unknown day on either side never is. */
	before(other: string | null): boolean {
		const { day } = this;
		const otherDay = new AirDate(other).day;

		return day !== null && otherDay !== null && day < otherDay;
	}

	/** Whether this and `other` are both known days at most `days` apart. */
	within(other: number | null, days: number): boolean {
		const { day } = this;

		return day !== null && other !== null && Math.abs(day - other) <= days;
	}

	/**
	 * Whether this and `other` agree: within `windowDays` when both are full
	 * dates, else in the same year when both years are known. A date with no
	 * year agrees with anything.
	 */
	agrees(other: string | null, windowDays: number): boolean {
		const offset = this.offset(other);

		if (offset !== null) {
			return offset <= windowDays;
		}

		const { year } = this;
		const otherYear = new AirDate(other).year;

		return year === null || otherYear === null || year === otherYear;
	}
}
