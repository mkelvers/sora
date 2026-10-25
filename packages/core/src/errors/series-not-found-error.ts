import { CoreError } from "./core-error";

/** The ID does not identify a stored series. */
export class SeriesNotFoundError extends CoreError {
	readonly seriesId: string;

	constructor(seriesId: string) {
		super("SERIES_NOT_FOUND", `Series ${seriesId} does not exist`);
		this.name = "SeriesNotFoundError";
		this.seriesId = seriesId;
	}
}
