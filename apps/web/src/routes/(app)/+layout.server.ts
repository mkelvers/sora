import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
    const here = encodeURIComponent(url.pathname + url.search);

    if (!locals.viewer) {
        redirect(303, `/login?redirect=${here}`);
    }

    if (!locals.viewer.profile) {
        redirect(303, `/profiles?redirect=${here}`);
    }

    return {
        canonical: new URL(url.pathname, url.origin).href,
        genres: await locals.viewer.sora.genres().catch(() => []),
        profile: locals.viewer.profile,
        profiles: locals.viewer.profiles,
    };
};
