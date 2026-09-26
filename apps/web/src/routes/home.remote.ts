import { query } from '$app/server';
import { fromSora, profile } from '$lib/server/sora';

export const getContinueWatching = query(() =>
	fromSora(() => {
		const account = profile();
		return account.sora.continueWatching(account.profileId);
	})
);
