import { query } from '$app/server';
import { z } from 'zod';
import { fromSora, sora } from '$lib/server/sora';

export const searchSeries = query(z.string(), (text) => fromSora(() => sora.search(text)));
