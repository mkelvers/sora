import { attempt, sequence } from "@sora/shared";
import type { Task } from "graphile-worker";
import { z } from "zod";

import { streamProviders } from "../../playback/providers/registry";
import { parseInput } from "../payload";

/** The graphile-worker task that mirrors provider catalogues. */
export const syncProvidersTask = "sync-provider-catalogs";

/**
 * Brings up to date the local copies of provider catalogues that series are
 * matched against, for the providers that keep one.
 *
 * Runs hourly to pick up what providers added or changed, and weekly with
 * `{ full: true }` to drop what they removed. A failing provider fails the
 * job once the others are synced, so graphile-worker retries it with backoff.
 */
export const syncProviders: Task = async (rawPayload, helpers) => {
	const payload = parseInput(
		z
			.object({
				full: z.boolean().optional(),
			})
			.nullish(),
		rawPayload,
	);

	const outcomes = await sequence.all(streamProviders, async (provider) => {
		if (!provider.syncCatalog) {
			return [];
		}

		const { data, error } = await attempt(
			provider.syncCatalog({
				full: payload?.full === true,
			}),
		);

		if (error) {
			helpers.logger.warn(`Provider ${provider.id} failed to sync its catalogue: ${error.message}`);

			return [provider.id];
		}

		helpers.logger.info(data);

		return [];
	});

	const failed = outcomes.flat();

	if (failed.length > 0) {
		throw new Error(`Syncing catalogues failed on ${failed.join(", ")}`);
	}
};
