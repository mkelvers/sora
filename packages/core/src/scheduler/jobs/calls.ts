import type { Task } from "graphile-worker";

import { pruneProviderCalls } from "../../playback/providers/calls";
import { getProviderHealth } from "../../playback/providers/health";

/** The graphile-worker task that drops old provider calls. */
export const pruneProviderCallsTask = "prune-provider-calls";

/** Drops recorded provider calls older than a month. Runs daily. */
export const pruneProviderCallsJob: Task = async (_payload, helpers) => {
  const deleted = await pruneProviderCalls();
  helpers.logger.info(`Pruned ${deleted} hourly rows of provider calls`);
};

/** The graphile-worker task that warns about providers that stopped working. */
export const checkProviderHealthTask = "check-provider-health";

/**
 * Warns about every provider that is being called but has had no successful
 * call for three hours, such as a scraper whose site changed.
 * Runs hourly, so the warning repeats until the provider recovers.
 */
export const checkProviderHealthJob: Task = async (_payload, helpers) => {
  for (const health of await getProviderHealth()) {
    if (health.status !== "failing") {
      continue;
    }

    const lastOk = health.lastOkAt ? `since ${health.lastOkAt}` : "on record";
    const lastError = health.lastError ? `; last error: ${health.lastError}` : "";
    helpers.logger.warn(`Provider ${health.provider} has had no successful call ${lastOk}${lastError}`);
  }
};
