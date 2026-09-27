import { form, getRequestEvent } from '$app/server';
import { error, invalid } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { z } from 'zod';
import { getListed } from '$lib/watchlist.remote';

export const importAniList = form(
	z.object({
		userName: z.string().trim().min(1, 'Enter your AniList user name'),
	}),
	async ({ userName }, issue) => {
		const {
			viewer,
		} = getRequestEvent().locals;
		if (!viewer?.profile) {
			error(403, 'Choose a profile first');
		}

		try {
			const summary = await viewer.sora.importAniList(viewer.profile.id, userName);
			await getListed().refresh();
			return summary;
		} catch (cause) {
			if (cause instanceof SoraError && cause.code === 'ANILIST_LIST_NOT_FOUND') {
				invalid(issue.userName(`AniList has no public anime list for ${userName}. Check the name, or make your list public in AniList’s settings.`));
			}

			if (cause instanceof SoraError && cause.code === 'INVALID_INPUT') {
				invalid(issue.userName('That isn’t an AniList user name.'));
			}

			throw cause;
		}
	}
);
