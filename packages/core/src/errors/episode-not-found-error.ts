import { CoreError } from "./core-error";

/** The series has no such episode, or nothing can stream it. */
export class EpisodeNotFoundError extends CoreError {
	constructor(seriesId: string, episode: number) {
		super("EPISODE_NOT_FOUND", `Series ${seriesId} has no playable episode ${episode}`);
		this.name = "EpisodeNotFoundError";
	}
}
