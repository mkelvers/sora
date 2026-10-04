import { attempt } from "@sora/shared";
import type { Task } from "graphile-worker";
import { z } from "zod";

import { streamProviders } from "../../playback/providers/registry";

const SyncProviderCatalogsPayloadSchema = z
	.object({
		full: z.boolean().optional(),
	})
	.nullish();

/** The graphile-worker task that mirrors provider catalogues. */
export const syncProviderCatalogsTask = "sync-provider-catalogs";

/**
 * Brings up to date the local copies of provider catalogues that series are
 * matched against, for the providers that keep one.
 *
 * Runs hourly to pick up what providers added or changed, and weekly with
 * `{ full: true }` to drop what they removed. A failing provider fails the
 * job once the others are synced, so graphile-worker retries it with backoff.
 */
export const syncProviderCatalogs: Task = async (rawPayload, helpers) => {
	const payload = SyncProviderCatalogsPayloadSchema.parse(rawPayload);

	const failed: string[] = [];
	for (const provider of streamProviders) {
		if (!provider.syncCatalog) {
			continue;
		}

		const { data: summary, error } = await attempt(
			provider.syncCatalog({
				full: payload?.full === true,
			}),
		);
		if (error) {
			helpers.logger.warn(`Provider ${provider.id} failed to sync its catalogue: ${error.message}`);
			failed.push(provider.id);
			continue;
		}
		helpers.logger.info(summary);
	}

	if (failed.length > 0) {
		throw new Error(`Syncing catalogues failed on ${failed.join(", ")}`);
	}
};
