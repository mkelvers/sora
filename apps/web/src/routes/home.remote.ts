import { query } from '$app/server';
import { fromSora, profile, sora } from '$lib/server/sora';

const featuredCount = 5;

export const getContinueWatching = query(() =>
	fromSora(() => {
		const account = profile();
		return account.sora.continueWatching(account.profileId);
	})
);

export const getRecommendations = query(() =>
	fromSora(() => {
		const account = profile();
		return account.sora.recommendations(account.profileId);
	})
);

export const getTrending = query(() => fromSora(() => sora.browse({
	params: {
		sort: 'trending',
		per_page: 24
	}
})));

export const getFeatured = query(() =>
	fromSora(async () => {
		const airing = await sora.browse({
			params: {
				status: 'RELEASING',
				sort: 'popular',
				per_page: 12
			}
		});
		const picked = airing.filter((card) => card.backdrop_url).slice(0, featuredCount);
		return Promise.all(picked.map((card) => sora.series(card.id)));
	})
);
