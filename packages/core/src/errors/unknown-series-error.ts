import { CoreError } from "./core-error";

/** The ID does not identify a stored series. */
export class UnknownSeriesError extends CoreError {
	readonly seriesId: string;

	constructor(seriesId: string) {
		super("SERIES_NOT_FOUND", `Series ${seriesId} does not exist`);
		this.name = "UnknownSeriesError";
		this.seriesId = seriesId;
	}
}
