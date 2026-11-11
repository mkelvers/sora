import { redirect } from "@sveltejs/kit";

import type { PageLoad } from "./$types";

export const load: PageLoad = ({ params }) => {
	redirect(308, `/browse?genre=${encodeURIComponent(params.genre)}`);
};
