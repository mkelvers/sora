import type { Task } from "graphile-worker";
import { z } from "zod";

import { syncAniKotoCatalog } from "../playback/providers/anikoto-catalog";
import { providerHttp } from "../playback/providers/registry";

const SyncAniKotoCatalogPayloadSchema = z
  .object({
    full: z.boolean().optional()
  })
  .nullish();

/**
 * Brings the mirror of AniKoto's catalogue up to date, which AniKoto matches
 * are made against.
 *
 * Runs hourly to pick up series AniKoto added or changed, and weekly with
 * `{ full: true }` to drop the ones it removed. The first run, with nothing
 * stored, reads the whole catalogue: about 450 pages at AniKoto's limit of 60
 * requests a minute.
 */
export const syncAniKotoCatalogJob: Task = async (rawPayload, helpers) => {
  const payload = SyncAniKotoCatalogPayloadSchema.parse(rawPayload);
  const { pages, stored } = await syncAniKotoCatalog(providerHttp, {
    full: payload?.full === true
  });
  helpers.logger.info(`Synced ${stored} AniKoto series from ${pages} catalogue pages`);
};
