import type { SeriesImage } from "@sora/sdk";

import { getSeries } from "../series.remote";
import { refreshImages, setArtwork, setLogoPlacement } from "./media.remote";

export class Media {
	#type = $state<SeriesImage["type"]>("poster");
	sort = $state<"votes" | "quality">("votes");
	languages = $state<string[]>([]);
	source = $state("all");
	refreshing = $state(false);
	error = $state<string>();

	get type() {
		return this.#type;
	}

	set type(value) {
		this.#type = value;
		this.languages = [];
		this.source = "all";
	}

	apply(images: SeriesImage[]) {
		let result = images.filter((image) => image.type === this.type);

		if (this.languages.length > 0) {
			result = result.filter((image) => this.languages.includes(image.language ?? "none"));
		}

		if (this.source === "series") {
			result = result.filter((image) => image.season_number === null);
		} else if (this.source !== "all") {
			result = result.filter((image) => image.season_number === Number(this.source));
		}

		if (this.sort === "quality") {
			const area = (image: SeriesImage) => image.width * image.height;
			result = result.toSorted((a, b) => area(b) - area(a));
		}

		return result;
	}

	choose = async (seriesId: string, url: string | false) => {
		try {
			await setArtwork({
				seriesId,
				type: this.type,
				url,
			}).updates(
				getSeries(seriesId).withOverride((current) => ({
					...current,
					[`${this.type}_url`]: url || null,
				})),
			);
			this.error = undefined;
		} catch {
			this.error = "That image couldn’t be saved.";
		}
	};

	place = async (seriesId: string, placement: { scale: number; x: number; y: number }) => {
		try {
			await setLogoPlacement({
				seriesId,
				...placement,
			}).updates(
				getSeries(seriesId).withOverride((current) => ({
					...current,
					logo_scale: placement.scale,
					logo_offset_x: placement.x,
					logo_offset_y: placement.y,
				})),
			);
			this.error = undefined;
		} catch {
			this.error = "That placement couldn’t be saved.";
		}
	};

	refresh = async (seriesId: string) => {
		this.refreshing = true;
		try {
			await refreshImages(seriesId);
			this.error = undefined;
		} catch {
			this.error = "TMDB couldn’t be reached. Try again in a moment.";
		} finally {
			this.refreshing = false;
		}
	};
}
