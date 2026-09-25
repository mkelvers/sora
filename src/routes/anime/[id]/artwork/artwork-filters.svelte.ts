import type { SeriesImage } from '@sora/sdk';

export class ArtworkFilters {
	#type = $state<SeriesImage['type']>('poster');
	sort = $state<'votes' | 'quality'>('votes');
	languages = $state<string[]>([]);
	source = $state('all');

	get type() {
		return this.#type;
	}

	set type(value) {
		this.#type = value;
		this.languages = [];
		this.source = 'all';
	}

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

		if (this.sort === 'quality') {
			result = result.toSorted((left, right) => right.width * right.height - left.width * left.height);
		}

		return result;
	}
}
