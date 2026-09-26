import type { SeriesImage } from '@sora/sdk';
import { getSeries } from '../series.remote';
import { setArtwork } from './artwork.remote';

export class Artwork {
	#type = $state<SeriesImage['type']>('poster');
	sort = $state<'votes' | 'quality'>('votes');
	languages = $state<string[]>([]);
	source = $state('all');
	error = $state<string>();

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
			const area = (image: SeriesImage) => image.width * image.height;
			result = result.toSorted((a, b) => area(b) - area(a));
		}

		return result;
	}

	choose = async (seriesId: string, url: string | null) => {
		const series = getSeries(seriesId);
		const saving = setArtwork({
			seriesId,
			type: this.type,
			url
		});

		try {
			if (url) {
				await saving.updates(
					series.withOverride((current) => ({
						...current,
						[`${this.type}_url`]: url
					}))
				);
			} else {
				await saving.updates(series);
			}

			this.error = undefined;
		} catch {
			this.error = url ? 'That image couldn’t be saved.' : 'The default couldn’t be restored.';
		}
	};
}
