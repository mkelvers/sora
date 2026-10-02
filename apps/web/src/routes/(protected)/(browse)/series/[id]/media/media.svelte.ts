import { getSeries } from "$routes/(protected)/(browse)/series/[id]/series.remote";
import type { SeriesImage } from "@sora/sdk";

import { refreshImages, setArtwork, setLogoPlacement } from "./media.remote";

export class Media {
	#type = $state<SeriesImage["type"]>("poster");
	languages = $state<string[]>([]);
	refreshing = $state(false);
	error = $state<string>();

	get type() {
		return this.#type;
	}

	set type(value) {
		this.#type = value;
		this.languages = [];
	}

	apply(images: SeriesImage[]) {
		let result = images.filter((image) => image.type === this.type);

		if (this.languages.length > 0) {
			result = result.filter((image) => this.languages.includes(image.language ?? "none"));
		}

		if (this.type !== "logo") {
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

	place = async (
		seriesId: string,
		placement: {
			scale: number;
			x: number;
			y: number;
		},
	) => {
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
