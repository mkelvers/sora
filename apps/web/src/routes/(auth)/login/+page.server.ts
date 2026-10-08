import { sora } from "$lib/server/sora";
import { SoraError } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";

import type { Actions, PageServerLoad } from "./$types";

const Credentials = z.object({
	email: z
		.string()
		.trim()
		.toLowerCase()
		.min(1, "Enter your e-mail.")
		.pipe(z.email("Enter a valid e-mail address.")),
	password: z.string().min(1, "Enter your password."),
});

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.viewer) {
		redirect(303, `/profiles${url.search}`);
	}
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const email = String(form.get("email") ?? "");
		const credentials = Credentials.safeParse({
			email,
			password: form.get("password") ?? "",
		});

		if (!credentials.success) {
			const { fieldErrors } = z.flattenError(credentials.error);

			return fail(400, {
				email,
				errors: {
					email: fieldErrors.email?.[0],
					password: fieldErrors.password?.[0],
				},
			});
		}

		const { data, error } = await attempt(
			sora.signIn(credentials.data, {
				headers: {
					"X-Forwarded-For": getClientAddress(),
				},
			}),
			SoraError,
		);
		if (error?.code === "INVALID_EMAIL_OR_PASSWORD") {
			return fail(400, {
				email,
				message: "Wrong e-mail or password.",
			});
		}
		if (error?.status === 429) {
			return fail(429, {
				email,
				message: "Too many attempts. Try again in a minute.",
			});
		}
		if (error) {
			throw error;
		}

		cookies.delete("sora_profile", {
			path: "/",
		});
		cookies.set("sora_session", data.token, {
			path: "/",
			httpOnly: true,
			sameSite: "lax",
			maxAge: 90 * 24 * 60 * 60,
		});

		redirect(303, `/profiles${url.search}`);
	},
};
