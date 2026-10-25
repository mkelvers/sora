import { day } from "@sora/shared";
import { and, eq } from "drizzle-orm";

import type { Anime } from "../../catalog/models/anime";
import { db } from "../../database/client";
import { providerMapping } from "../../database/schema/playback";
import type { StreamProvider } from "../providers/provider";

/** A confirmed match is reused for a month before being re-verified. */
const matchedMappingLifetimeMs = 30 * day;
/**
 * A failed match is retried daily, since providers add titles over time. So
 * is one made by title or as a continuation of a prequel: the provider may
 * have added a series of the anime's own since, as AniKoto does for a new
 * cour it first files under the previous one.
 */
const provisionalMappingLifetimeMs = day;

/** Methods whose match a provider's own entry for the anime replaces. */
const provisionalMethods = new Set(["title", "continuation"]);

/** Where an anime's episodes are in a provider's catalogue. */
export interface ProviderMedia {
	/** The provider's raw media ID. */
	mediaId: string;
	/**
	 * Provider episodes that belong to earlier parts: the anime's first
	 * episode is the provider's episode `episodeOffset + 1`.
	 */
	episodeOffset: number;
}

const toProviderMedia = (mapping: { providerMediaId: string | null; episodeOffset: number }) =>
	mapping.providerMediaId
		? {
				episodeOffset: mapping.episodeOffset,
				mediaId: mapping.providerMediaId,
			}
		: null;

/**
 * Resolves where an anime is in a provider's catalogue, using the stored
 * mapping when it is still valid. Returns `null` when the provider has no
 * confident match.
 *
 * @param options.retryUnmatched - Search again even if a failed match is
 *   younger than a day, for anime that may have just premiered.
 */
export const getProviderMedia = async (
	anime: Anime,
	provider: StreamProvider,
	options: {
		retryUnmatched: boolean;
	},
): Promise<ProviderMedia | null> => {
	const [stored] = await db
		.select()
		.from(providerMapping)
		.where(and(eq(providerMapping.anilistId, anime.id), eq(providerMapping.provider, provider.id)))
		.limit(1);

	if (stored && (stored.providerMediaId || !options.retryUnmatched)) {
		const lifetime =
			stored.providerMediaId && !provisionalMethods.has(stored.method ?? "")
				? matchedMappingLifetimeMs
				: provisionalMappingLifetimeMs;
		if (stored.resolvedAt.getTime() + lifetime > Date.now()) {
			return toProviderMedia(stored);
		}
	}

	const match = await provider.findMedia(anime);
	const values = {
		episodeOffset: match?.episodeOffset ?? 0,
		matchedTitle: match?.matchedTitle ?? null,
		method: match?.method ?? null,
		providerMediaId: match?.mediaId ?? null,
		resolvedAt: new Date(),
	};

	await db
		.insert(providerMapping)
		.values({
			anilistId: anime.id,
			provider: provider.id,
			...values,
		})
		.onConflictDoUpdate({
			set: values,
			target: [providerMapping.anilistId, providerMapping.provider],
		});

	return toProviderMedia(values);
};
