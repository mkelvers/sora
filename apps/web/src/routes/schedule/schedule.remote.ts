import { query } from '$app/server';
import { fromSora, sora } from '$lib/server/sora';

export const getSchedule = query(() => fromSora(() => sora.schedule()));
