import { and, inArray, isNull } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type { Anime } from "../../catalog/models/anime";
import { db } from "../../database/client";
import { providerEpisodes, providerMapping } from "../../database/schema/playback";
import type { ContentLanguage } from "../../models/series";
import type { ProviderEpisode, StreamProvider } from "../providers/provider";
import { aniKoto, servedLocale } from "../providers/registry";
import { servesDub, withConfirmedDubs } from "../streams/dub-audio";
import { Listing, ProviderUnitsSchema } from "./listing";
import { getProviderMedia } from "./mapping";

/**
 * An episode as a provider lists it, numbered as the anime numbers it: a part
 * the provider files under its prequel counts from 1.
 */
export type ProviderUnit = ProviderEpisode;

/**
 * `units` cut off at the first jump of more than {@link strayGap} episodes
 * that lands past the total AniList counts for a finished anime.
 *
 * A provider's API sometimes returns a stray episode far from the rest for a
 * moment (Rascal Does Not Dream of a Dreaming Girl, a film, listed an
 * "Episode 192"), and the stored list is not asked again once the anime has
 * finished. A list that runs on without such a jump is kept however long it
 * is, since providers file several of AniList's entries under one series.
 *
 * @param units - Sorted by number.
 */
export const withoutStrays = <TUnit extends { number: number }>(
	units: readonly TUnit[],
	anime: Pick<Anime, "episodes" | "status">,
): TUnit[] => {
	/**
	 * How far past the end of a finished anime a provider's episode numbers may
	 * jump before the rest are taken for strays.
	 */
	const strayGap = 10;

	const { episodes: total, status } = anime;

	if (status !== "FINISHED" || total === null) {
		return [...units];
	}

	const stray = units.findIndex(
		(unit, index) =>
			unit.number > total && unit.number - (units[index - 1]?.number ?? 0) > strayGap,
	);

	if (stray === -1) {
		return [...units];
	}

	return units.slice(0, stray);
};

/**
 * Fetches `provider`'s episode units for `anime` and stores them, replacing
 * any stored list. A dub the stored list did not have is kept only once its
 * stream plays in the served locale (see {@link withConfirmedDubs}).
 *
 * Nothing is stored when the provider does not carry the anime, so a later
 * request asks again once the provider mapping is retried.
 *
 * @param options.retryUnmatched - Search the provider's catalogue again even
 *   if it recently had no match, for anime that may have just premiered.
 * @throws {Error} when the provider itself fails.
 */
export const refreshProviderUnits = async (
	anime: Anime,
	provider: StreamProvider,
	options: {
		retryUnmatched: boolean;
	},
): Promise<ProviderUnit[]> => {
	const media = await getProviderMedia(anime, provider, options);

	if (!media) {
		return [];
	}

	const { mediaId, episodeOffset } = media;
	const listedUnits = await provider.listEpisodes(mediaId);

	const mapped: ProviderUnit[] = listedUnits
		// A part filed under its prequel's series keeps only its own episodes,
		// numbered from 1; a later part may follow them in the same series.
		.filter(
			(unit) =>
				episodeOffset === 0 ||
				(unit.number > episodeOffset &&
					(anime.episodes === null || unit.number <= episodeOffset + anime.episodes)),
		)
		.map((unit) => ({
			id: unit.id,
			isFiller: unit.isFiller,
			languages: unit.languages,
			number: unit.number - episodeOffset,
			title: unit.title,
		}))
		.toSorted((left, right) => left.number - right.number);

	const listing = new Listing(anime.id, provider.id);
	const previous = await listing.stored();
	let units = withoutStrays(mapped, anime);

	if (provider.listsLanguages) {
		units = await withConfirmedDubs(units, previous, async (unit) => {
			const confirmed = await servesDub(provider, unit.id);

			if (!confirmed) {
				console.warn(
					`${provider.id} lists a dub of anime ${anime.id} episode ${unit.number} that does not play in ${servedLocale}`,
				);
			}

			return confirmed;
		});
	}

	const values = {
		fetchedAt: new Date(),
		units,
	};

	if (provider.id === aniKoto.id) {
		await listing.recordDubs(units, previous, values.fetchedAt);
	}

	await db
		.insert(providerEpisodes)
		.values({
			anilistId: anime.id,
			provider: provider.id,
			...values,
		})
		.onConflictDoUpdate({
			set: values,
			target: [providerEpisodes.anilistId, providerEpisodes.provider],
		});

	return units;
};

/**
 * Returns `provider`'s episode units for `anime`.
 *
 * A stored list is served as is: the airing scheduler refreshes the lists of
 * anime that are still airing, and a finished anime's list does not change.
 * An anime the provider does not carry yields an empty list.
 *
 * @throws {Error} when the provider itself fails; callers decide whether to fall back.
 */
export const getProviderUnits = async (
	anime: Anime,
	provider: StreamProvider,
): Promise<ProviderUnit[]> => {
	const stored = await new Listing(anime.id, provider.id).stored();

	if (stored) {
		return stored;
	}

	return refreshProviderUnits(anime, provider, {
		retryUnmatched: false,
	});
};

/** What is stored about one provider's episodes of one anime. */
export interface StoredUnits {
	anilistId: number;
	provider: string;
	/** The provider's episode list, empty when the provider does not carry the anime. */
	units: ProviderUnit[];
}

/** What is stored about the languages one provider's episodes of one anime are offered in. */
export interface StoredLanguages {
	anilistId: number;
	provider: string;
	/** Empty when the provider does not carry the anime. */
	languages: ContentLanguage[];
}

/**
 * Reads which languages the stored episode lists of the given anime are
 * offered in, without reading the lists themselves or asking any provider.
 * A provider with no entry for an anime has not been looked up yet; one
 * that does not carry it is listed with no languages.
 *
 * @param providers - Reads only these providers' lists.
 */
export const getStoredLanguages = async (
	anilistIds: readonly number[],
	providers: readonly string[],
): Promise<StoredLanguages[]> => {
	if (anilistIds.length === 0 || providers.length === 0) {
		return [];
	}

	const ids = [...new Set(anilistIds)];

	const [listed, unmatched] = await Promise.all([
		db
			.select({
				anilistId: providerEpisodes.anilistId,
				languages: providerEpisodes.languages,
				provider: providerEpisodes.provider,
			})
			.from(providerEpisodes)
			.where(
				and(
					inArray(providerEpisodes.anilistId, ids),
					inArray(providerEpisodes.provider, [...providers]),
				),
			),
		db
			.select({
				anilistId: providerMapping.anilistId,
				provider: providerMapping.provider,
			})
			.from(providerMapping)
			.where(
				and(
					inArray(providerMapping.anilistId, ids),
					isNull(providerMapping.providerMediaId),
					inArray(providerMapping.provider, [...providers]),
				),
			),
	]);

	return [
		...listed,
		...unmatched.map((row) => ({
			...row,
			languages: [],
		})),
	];
};

/**
 * Reads the stored episode lists of the given anime, without asking any
 * provider. A provider missing for an anime has not been looked up yet, or
 * its stored list is outdated; {@link getProviderUnits} fills it in.
 *
 * @param providers - Reads only these providers' lists, which skips parsing the others.
 */
export const getStoredUnits = async (
	anilistIds: readonly number[],
	providers?: readonly string[],
): Promise<StoredUnits[]> => {
	if (anilistIds.length === 0) {
		return [];
	}

	const ids = [...new Set(anilistIds)];
	let listedProvider: SQL | undefined;
	let unmatchedProvider: SQL | undefined;

	if (providers) {
		listedProvider = inArray(providerEpisodes.provider, [...providers]);
		unmatchedProvider = inArray(providerMapping.provider, [...providers]);
	}

	const [listed, unmatched] = await Promise.all([
		db
			.select()
			.from(providerEpisodes)
			.where(and(inArray(providerEpisodes.anilistId, ids), listedProvider)),
		db
			.select({
				anilistId: providerMapping.anilistId,
				provider: providerMapping.provider,
			})
			.from(providerMapping)
			.where(
				and(
					inArray(providerMapping.anilistId, ids),
					isNull(providerMapping.providerMediaId),
					unmatchedProvider,
				),
			),
	]);

	return [
		...listed.flatMap((row) => {
			const units = ProviderUnitsSchema.safeParse(row.units);

			if (units.success) {
				return [
					{
						anilistId: row.anilistId,
						provider: row.provider,
						units: units.data,
					},
				];
			}

			return [];
		}),
		...unmatched.map((row) => ({
			...row,
			units: [],
		})),
	];
};
