import { route, SoraError } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { error, fail, redirect } from "@sveltejs/kit";
import { z } from "zod";

import type { Actions } from "./$types";

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const form = await request.formData();
		const name = String(form.get("name") ?? "");
		const parsed = z.string().trim().min(1).max(40).safeParse(name);

		if (!parsed.success) {
			return fail(400, {
				name,
				message: "Give the profile a name of up to 40 characters.",
			});
		}

		if (!locals.viewer) {
			error(401, "Not signed in");
		}

		const { error: rejected } = await attempt(
			locals.viewer.sora.request(route.createProfile, {
				body: {
					name: parsed.data,
				},
			}),
			SoraError,
		);
		if (rejected?.status === 422) {
			return fail(400, {
				name,
				message: "Give the profile a name of up to 40 characters.",
			});
		}
		if (rejected) {
			throw rejected;
		}

		redirect(303, `/profiles${url.search}`);
	},
};
