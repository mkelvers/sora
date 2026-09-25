import type { Task } from "graphile-worker";

import { pruneProviderCalls } from "../playback/providers/calls";

/** Drops recorded provider calls older than a month. Runs daily. */
export const pruneProviderCallsJob: Task = async (_payload, helpers) => {
  const deleted = await pruneProviderCalls();
  helpers.logger.info(`Pruned ${deleted} hourly rows of provider calls`);
};
