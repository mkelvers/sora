import type { SeriesImage } from '@sora/sdk';
import { getSeries } from '../series.remote';
import { setArtwork } from './artwork.remote';

export async function chooseArtwork(
	id: string,
	type: SeriesImage['type'],
	url: string | null
) {
	const title = getSeries(id);
	const saving = setArtwork({
		seriesId: id,
		type,
		url
	});

	if (url) {
		await saving.updates(
			title.withOverride((series) => ({
				...series,
				[`${type}_url`]: url
			}))
		);
	} else {
		await saving.updates(title);
	}
}
