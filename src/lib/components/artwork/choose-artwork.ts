import type { SeriesImage } from '@sora/sdk';
import { getSeries, setArtwork } from '$lib/remote/anime.remote';

/** Makes `url` the title's artwork of `type`, shown before the save lands; `null` goes back to Sora's choice. */
export async function chooseArtwork(seriesId: string, type: SeriesImage['type'], url: string | null) {
	const title = getSeries(seriesId);
	const saving = setArtwork({
		seriesId,
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
