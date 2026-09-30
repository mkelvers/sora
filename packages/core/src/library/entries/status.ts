import type { SeriesProgress } from "../progress/resume";
import type { LibraryStatus } from "./entries";

/**
 * The status a series should have after the user played or marked episodes
 * of `touched` seasons, or looked at it (none touched):
 *
 * - {@link SeriesProgress.finished} progress makes it `completed`.
 * - A `completed` series stays completed until the user plays or marks a
 *   main season they have not completed, such as one released since.
 *   Replaying what they finished, or playing a film or OVA, does not
 *   reopen it.
 * - A `dropped` series stays dropped; only picking it back up (see
 *   `pickUpTitle`) or playing it ends that.
 * - Otherwise it is `watching` once any episode has a checkpoint, and
 *   `planning` while none has, such as after starting it over.
 *
 * @returns `null` for a series not in the library that the user has not started.
 */
export function statusFor(
	current: LibraryStatus | null,
	progress: SeriesProgress,
	touched: readonly string[],
): LibraryStatus | null {
	if (current === "dropped") {
		return "dropped";
	}

	if (progress.lastWatchedAt === null) {
		return current && "planning";
	}

	if (progress.finished) {
		return "completed";
	}

	const reopened = touched.some(
		(seasonId) =>
			!progress.seasons.some((season) => season.seasonId === seasonId && season.completed),
	);
	return current === "completed" && !reopened ? "completed" : "watching";
}
