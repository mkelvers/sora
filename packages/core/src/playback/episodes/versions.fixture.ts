import type { ContentLanguage } from "../../models/series";
import type { ProviderUnit } from "./episodes";
import type { ListedUnit } from "./versions";

/**
 * A provider stand-in: its ID, what it serves, its stored episode list for
 * each anime (`null` for an anime it has not been looked up for), and
 * what it answers when asked.
 */
export interface FakeProvider {
	id: string;
	locale: string;
	listsLanguages: boolean;
	units: (anilistId: number) => ProviderUnit[] | null;
	ask: () => Promise<ProviderUnit[]>;
}

export const unit = (
	number: number,
	languages: ContentLanguage[] | null,
	isFiller: boolean | null = null,
): ProviderUnit => ({
	addedAt: null,
	id: `unit-${number}`,
	isFiller,
	languages,
	number,
	title: `Episode ${number}`,
});

export const listed = (
	locale: string,
	languages: ContentLanguage[] | null,
	listsLanguages = true,
): ListedUnit => ({
	source: {
		listsLanguages,
		locale,
	},
	unit: unit(1, languages),
});

/** A provider that has been looked up for every anime and lists `units` for each. */
export const provider = (
	id: string,
	locale: string,
	units: ProviderUnit[],
	listsLanguages = true,
): FakeProvider => ({
	ask: () => Promise.resolve(units),
	id,
	listsLanguages,
	locale,
	units: () => units,
});

/**
 * A provider that has not been looked up for any anime yet, and answers
 * `answer` when asked, or fails without one.
 */
export const notLookedUp = (id: string, locale: string, answer?: ProviderUnit[]): FakeProvider => ({
	...provider(id, locale, []),
	ask: () => {
		if (!answer) {
			return Promise.reject(new Error(`${id} is down`));
		}

		return Promise.resolve(answer);
	},
	units: () => null,
});

export const listedAs = (isFiller: boolean | null): ListedUnit => ({
	source: {
		listsLanguages: true,
		locale: "en",
	},
	unit: unit(1, ["sub"], isFiller),
});
