import type { Task } from "graphile-worker";

import { storeMissingBackdropEdges } from "../../series/edges";

/** The graphile-worker task that measures backdrop edges left unmeasured. */
export const storeMissingTask = "store-missing-backdrop-edges";

/**
 * Measures the edges of every backdrop readers see that has none stored:
 * those whose image failed to load when their series was stored or their
 * artwork was chosen, and those stored before edges were measured.
 */
export const storeMissing: Task = async (_payload, helpers) => {
	const { stored, failed } = await storeMissingBackdropEdges();

	if (stored + failed > 0) {
		helpers.logger.info(`Measured ${stored} backdrop edges; ${failed} failed`);
	}
};
