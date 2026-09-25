import type { SeriesImage } from '@sora/sdk';

/** What the artwork page shows: one type of image, narrowed and ordered. */
export class ArtworkFilters {
	#type = $state<SeriesImage['type']>('poster');
	sort = $state<'votes' | 'quality'>('votes');
	/** ISO 639-1 codes, `none` meaning textless; every language when empty. */
	languages = $state<string[]>([]);
	/** `all`, `series` for the title's own images, or a season number. */
	source = $state('all');

	get type() {
		return this.#type;
	}

	// Filters belong to the type they were set on.
	set type(value) {
		this.#type = value;
		this.languages = [];
		this.source = 'all';
	}

	/** The images of the chosen type that match every filter, in the chosen order. */
	apply(images: SeriesImage[]) {
		let result = images.filter((image) => image.type === this.type);

		if (this.languages.length > 0) {
			result = result.filter((image) => this.languages.includes(image.language ?? 'none'));
		}

		if (this.source === 'series') {
			result = result.filter((image) => image.season_number === null);
		} else if (this.source !== 'all') {
			result = result.filter((image) => image.season_number === Number(this.source));
		}

		// The API lists images by votes already; quality is sorted here.
		if (this.sort === 'quality') {
			result = result.toSorted((left, right) => right.width * right.height - left.width * left.height);
		}

		return result;
	}
}
