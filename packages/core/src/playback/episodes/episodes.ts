import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Anime } from "../../catalog/models/anime";
import { db } from "../../database/client";
import { episodeDub, providerEpisodes, providerMapping } from "../../database/schema/playback";
import { LanguageSchema } from "../../models/series";
import type { ContentLanguage } from "../../models/series";
import type { ProviderEpisode, StreamProvider } from "../providers/provider";
import { aniKoto, servedLocale } from "../providers/registry";
import { streamsDub, withConfirmedDubs } from "../streams/dub-audio";
import { getProviderMedia } from "./mapping";

/**
 * An episode as a provider lists it, numbered as the anime numbers it: a part
 * the provider files under its prequel counts from 1.
 */
export type ProviderUnit = ProviderEpisode;

/**
 * A stored list that does not match this, such as one stored before a field
 * was added, is fetched again rather than served.
 */
const ProviderUnitsSchema = z.array(
	z.object({
		id: z.string(),
		isFiller: z.boolean().nullable(),
		languages: z.array(LanguageSchema).nullable(),
		number: z.number(),
		title: z.string(),
	}),
);

/**
 * Records the dubs in AniKoto's episode list of an anime that are not
 * recorded yet, before the list replaces `previous`, the stored one.
 *
 * A dub that appeared on an episode the stored list already had came out
 * now. One nobody saw come out has no time: the list is the first stored
 * for the anime, or the dub arrived together with its episode, which the
 * episode coming out already tells.
 */
const recordDubs = async (
	anilistId: number,
	units: readonly ProviderUnit[],
	previous: readonly ProviderUnit[] | null,
	now: Date,
) => {
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
		.where(eq(episodeDub.anilistId, anilistId));
	const known = new Set(recorded.map((row) => row.episode));
	const carried = new Set(previous?.map((unit) => unit.number));

	const fresh = dubbed.filter((unit) => !known.has(unit.number));
	if (fresh.length > 0) {
		await db
			.insert(episodeDub)
			.values(
				fresh.map((unit) => ({
					anilistId,
					episode: unit.number,
					releasedAt: carried.has(unit.number) ? now : null,
				})),
			)
			.onConflictDoNothing();
	}
};

/** `provider`'s stored episode list for an anime; `null` when none is stored or it is outdated. */
const readStoredUnits = async (anilistId: number, providerId: string) => {
	const [stored] = await db
		.select({
			units: providerEpisodes.units,
		})
		.from(providerEpisodes)
		.where(
			and(eq(providerEpisodes.anilistId, anilistId), eq(providerEpisodes.provider, providerId)),
		)
		.limit(1);

	const units = stored ? ProviderUnitsSchema.safeParse(stored.units) : null;
	return units?.success ? units.data : null;
};

/**
 * How far past the end of a finished anime a provider's episode numbers may
 * jump before the rest are taken for strays.
 */
const strayGap = 10;

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
export const withoutStrayEpisodes = <TUnit extends { number: number }>(
	units: readonly TUnit[],
	anime: Pick<Anime, "episodes" | "status">,
): TUnit[] => {
	const { episodes: total, status } = anime;
	if (status !== "FINISHED" || total === null) {
		return [...units];
	}

	const stray = units.findIndex(
		(unit, index) =>
			unit.number > total && unit.number - (units[index - 1]?.number ?? 0) > strayGap,
	);
	return stray === -1 ? [...units] : units.slice(0, stray);
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
	const previous = await readStoredUnits(anime.id, provider.id);
	const units = provider.listsLanguages
		? await withConfirmedDubs(withoutStrayEpisodes(mapped, anime), previous, async (unit) => {
				const confirmed = await streamsDub(provider, unit.id);
				if (!confirmed) {
					console.warn(
						`${provider.id} lists a dub of anime ${anime.id} episode ${unit.number} that does not play in ${servedLocale}`,
					);
				}
				return confirmed;
			})
		: withoutStrayEpisodes(mapped, anime);

	const values = {
		fetchedAt: new Date(),
		units,
	};
	if (provider.id === aniKoto.id) {
		await recordDubs(anime.id, units, previous, values.fetchedAt);
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
	const stored = await readStoredUnits(anime.id, provider.id);
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
	const [listed, unmatched] = await Promise.all([
		db
			.select()
			.from(providerEpisodes)
			.where(
				and(
					inArray(providerEpisodes.anilistId, ids),
					providers ? inArray(providerEpisodes.provider, [...providers]) : undefined,
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
					providers ? inArray(providerMapping.provider, [...providers]) : undefined,
				),
			),
	]);

	return [
		...listed.flatMap((row) => {
			const units = ProviderUnitsSchema.safeParse(row.units);
			return units.success
				? [
						{
							anilistId: row.anilistId,
							provider: row.provider,
							units: units.data,
						},
					]
				: [];
		}),
		...unmatched.map((row) => ({
			...row,
			units: [],
		})),
	];
};
