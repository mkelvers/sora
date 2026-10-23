import { env } from "$env/dynamic/private";
import { sora } from "$lib/server/sora";
import { SoraError } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";

import type { Actions, PageServerLoad } from "./$types";

const Credentials = z.object({
	username: z.string().trim().toLowerCase().min(1, "Enter your username."),
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
		const username = String(form.get("username") ?? "");
		const credentials = Credentials.safeParse({
			username,
			password: form.get("password") ?? "",
		});

		if (!credentials.success) {
			const { fieldErrors } = z.flattenError(credentials.error);

			return fail(400, {
				username,
				errors: {
					username: fieldErrors.username?.[0],
					password: fieldErrors.password?.[0],
				},
			});
		}

		const { data, error } = await attempt(
			sora.signIn(credentials.data, {
				headers: {
					"X-Forwarded-For": getClientAddress(),
					"X-Sora-Client-Key": env.WEB_CLIENT_KEY!,
				},
			}),
			SoraError,
		);
		if (error?.code === "INVALID_USERNAME_OR_PASSWORD") {
			return fail(400, {
				username,
				message: "Wrong username or password.",
			});
		}
		if (error?.status === 429) {
			return fail(429, {
				username,
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
