import { getSeries } from "$routes/(app)/series/[id]/series.remote";
import type { SeriesImage } from "@sora/sdk";
import { attempt } from "@sora/shared";

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
		const { error } = await attempt(
			setArtwork({
				seriesId,
				type: this.type,
				url,
			}).updates(
				getSeries(seriesId).withOverride((current) => ({
					...current,
					[`${this.type}_url`]: url || null,
				})),
			),
		);
		this.error = error ? "That image couldn’t be saved." : undefined;
	};

	place = async (
		seriesId: string,
		placement: {
			scale: number;
			x: number;
			y: number;
		},
	) => {
		const { error } = await attempt(
			setLogoPlacement({
				seriesId,
				...placement,
			}).updates(
				getSeries(seriesId).withOverride((current) => ({
					...current,
					logo_scale: placement.scale,
					logo_offset_x: placement.x,
					logo_offset_y: placement.y,
				})),
			),
		);
		this.error = error ? "That placement couldn’t be saved." : undefined;
	};

	refresh = async (seriesId: string) => {
		this.refreshing = true;
		const { error } = await attempt(refreshImages(seriesId));
		this.refreshing = false;
		this.error = error ? "TMDB couldn’t be reached. Try again in a moment." : undefined;
	};
}
