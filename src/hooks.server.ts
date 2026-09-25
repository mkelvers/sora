import type { Handle } from '@sveltejs/kit';

import { sora } from '$lib/server/sora';

export const handle: Handle = ({ event, resolve }) => {
	event.locals.sora = sora;
	return resolve(event);
};
