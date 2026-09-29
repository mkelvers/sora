import type { Task } from "graphile-worker";

import { recordReleases } from "../../library/notifications/releases";

/** The graphile-worker task that records what came out for series in libraries. */
export const recordReleasesTask = "record-releases";

/**
 * Records the episodes, seasons, and films that came out for the series in
 * anyone's library, which notifications are read from. Runs every minute,
 * so a notification follows within a minute of a season listing an episode.
 */
export const recordReleasesJob: Task = async (_payload, helpers) => {
	const released = await recordReleases();
	if (released > 0) {
		helpers.logger.info(`Recorded ${released} released episodes for notifications`);
	}
};
