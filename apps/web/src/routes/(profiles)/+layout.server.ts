import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
    if (!locals.viewer) {
        redirect(303, `/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
    }
};
