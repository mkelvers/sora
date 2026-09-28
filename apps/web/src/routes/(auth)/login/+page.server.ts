import { profileCookie, sessionCookie, sora } from "$lib/server/sora";
import { SoraError } from "@sora/sdk";
import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";

import type { Actions, PageServerLoad } from "./$types";

const Credentials = z.object({
	email: z.string().trim().toLowerCase().pipe(z.email()),
	password: z.string().min(1),
});

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.viewer) {
		redirect(303, `/profiles${url.search}`);
	}
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = String(form.get("email") ?? "");
		const credentials = Credentials.safeParse({
			email,
			password: form.get("password"),
		});

		if (!credentials.success) {
			return fail(400, {
				email,
				message: "Enter your e-mail and password.",
			});
		}

		try {
			const session = await sora.signIn(credentials.data);
			cookies.delete(profileCookie, {
				path: "/",
			});
			cookies.set(sessionCookie, session.token, {
				path: "/",
				httpOnly: true,
				sameSite: "lax",
				maxAge: 90 * 24 * 60 * 60,
			});
		} catch (cause) {
			if (cause instanceof SoraError && cause.code === "INVALID_EMAIL_OR_PASSWORD") {
				return fail(400, {
					email,
					message: "Wrong e-mail or password.",
				});
			}
			if (cause instanceof SoraError && cause.status === 429) {
				return fail(429, {
					email,
					message: "Too many attempts. Try again in a minute.",
				});
			}
			throw cause;
		}

		redirect(303, `/profiles${url.search}`);
	},
};
