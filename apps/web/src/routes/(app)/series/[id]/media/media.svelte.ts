import { getSeries } from "$routes/(app)/series/[id]/series.remote";
import type { SeriesImage } from "@sora/sdk";
import { attempt } from "@sora/shared";

import { refreshImages, setArtwork, setLogoPlacement } from "./media.remote";

export class Media {
	#type = $state<SeriesImage["type"]>("poster");
	languages = $state<string[]>([]);
	refreshing = $state(false);
	error = $state<string>();

	constructor(private id: () => string) {}

	get type() {
		return this.#type;
	}

	set type(value) {
		this.#type = value;
		this.languages = [];
	}

	apply<T extends SeriesImage>(images: T[]) {
		const shown = images.filter(
			(image) =>
				image.type === this.type &&
				(!this.languages.length || this.languages.includes(image.language ?? "none")),
		);

		return this.type === "logo"
			? shown
			: shown.toSorted((a, b) => b.width * b.height - a.width * a.height);
	}

	toggle(language: string) {
		this.languages = this.languages.includes(language)
			? this.languages.filter((other) => other !== language)
			: [...this.languages, language];
	}

	choose(url: string | false) {
		return this.#save(
			setArtwork({
				seriesId: this.id(),
				type: this.type,
				url,
			}).updates(
				getSeries(this.id()).withOverride((current) => ({
					...current,
					[`${this.type}_url`]: url || null,
				})),
			),
			"That image couldn’t be saved.",
		);
	}

	place(placement: { scale: number; x: number; y: number }) {
		return this.#save(
			setLogoPlacement({
				seriesId: this.id(),
				...placement,
			}).updates(
				getSeries(this.id()).withOverride((current) => ({
					...current,
					logo_scale: placement.scale,
					logo_offset_x: placement.x,
					logo_offset_y: placement.y,
				})),
			),
			"That placement couldn’t be saved.",
		);
	}

	async refresh() {
		this.refreshing = true;
		await this.#save(refreshImages(this.id()), "TMDB couldn’t be reached. Try again in a moment.");
		this.refreshing = false;
	}

	async #save(work: Promise<unknown>, failure: string) {
		const { error } = await attempt(work);
		this.error = error ? failure : undefined;
	}
}
