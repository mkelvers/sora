import { CoreError } from "./core-error";

/** The AniList ID does not identify an anime. */
export class UnknownAnimeError extends CoreError {
	readonly anilistId: number;

	constructor(anilistId: number) {
		super("ANIME_NOT_FOUND", `Anime ${anilistId} does not exist`);
		this.name = "UnknownAnimeError";
		this.anilistId = anilistId;
	}
}
