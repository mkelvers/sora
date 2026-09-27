import { command, getRequestEvent, query } from '$app/server';
import { error } from '@sveltejs/kit';
import type { HistoryItem } from '@sora/sdk';
import { z } from 'zod';

export const getHistory = query(z.number().int().positive(), async (pages) => {
	const {
		viewer,
	} = getRequestEvent().locals;
	if (!viewer?.profile) {
		error(403, 'Choose a profile first');
	}

	const items: HistoryItem[] = [];
	let after: string | undefined;
	for (let index = 0; index < pages; index++) {
		const {
			results,
			meta,
		} = await viewer.sora.history(viewer.profile.id, {
			params: {
				after,
			},
			meta: true,
		});
		items.push(...results);
		after = meta.next ? new URL(meta.next, 'http://sora').searchParams.get('after') ?? undefined : undefined;
		if (!after) {
			break;
		}
	}

	return {
		items,
		more: after !== undefined,
	};
});

export const forget = command(
	z.array(
		z.object({
			seasonId: z.string(),
			number: z.number().int().positive(),
		})
	),
	async (episodes) => {
		const {
			viewer,
		} = getRequestEvent().locals;
		if (!viewer?.profile) {
			error(403, 'Choose a profile first');
		}

		for (const episode of episodes) {
			await viewer.sora.forgetEpisode(viewer.profile.id, episode);
		}
	}
);
