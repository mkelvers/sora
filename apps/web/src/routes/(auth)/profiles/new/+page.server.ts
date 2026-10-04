import { route, SoraError } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";

import type { Actions } from "./$types";

const Name = z.string().trim().min(1).max(40);

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const form = await request.formData();
		const name = String(form.get("name") ?? "");
		const parsed = Name.safeParse(name);

		if (!parsed.success) {
			return fail(400, {
				name,
				message: "Give the profile a name of up to 40 characters.",
			});
		}

		const { error } = await attempt(
			locals.viewer!.sora.request(route.createProfile, {
				body: {
					name: parsed.data,
				},
			}),
			SoraError,
		);
		if (error?.status === 422) {
			return fail(400, {
				name,
				message: "Give the profile a name of up to 40 characters.",
			});
		}
		if (error) {
			throw error;
		}

		redirect(303, `/profiles${url.search}`);
	},
};
