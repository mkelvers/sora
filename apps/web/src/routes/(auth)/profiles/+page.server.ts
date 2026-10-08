import { error, redirect } from "@sveltejs/kit";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.viewer) {
		error(401, "Not signed in");
	}

	return {
		profiles: locals.viewer.profiles,
	};
};

export const actions: Actions = {
	select: async ({ request, locals, cookies, url }) => {
		const form = await request.formData();
		const id = form.get("profile");
		if (!locals.viewer) {
			error(401, "Not signed in");
		}
		const profile = locals.viewer.profiles.find((profile) => profile.id === id);

		if (!profile) {
			error(404, "No such profile");
		}

		cookies.set("sora_profile", profile.id, {
			path: "/",
			httpOnly: true,
			sameSite: "lax",
			maxAge: 60 * 60,
		});

		const target = new URL(url.searchParams.get("redirect") ?? "/", url.origin);
		const path = target.pathname + target.search;
		redirect(303, target.origin === url.origin && !path.startsWith("//") ? path : "/");
	},
};
