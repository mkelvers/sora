import { env } from "$env/dynamic/private";
import { knownProfiles } from "$lib/server/sora";
import { SoraError } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { error, fail } from "@sveltejs/kit";
import { z } from "zod";

import type { Actions } from "./$types";

const Passwords = z
	.object({
		confirmPassword: z.string(),
		currentPassword: z.string().min(1, "Enter your current password."),
		newPassword: z.string().min(8, "Use at least 8 characters."),
	})
	.refine((passwords) => passwords.newPassword === passwords.confirmPassword, {
		message: "The passwords don't match.",
		path: ["confirmPassword"],
	})
	.refine((passwords) => passwords.newPassword !== passwords.currentPassword, {
		message: "Choose a password you aren't using now.",
		path: ["newPassword"],
	});

export const actions: Actions = {
	default: async ({ request, locals, cookies, getClientAddress }) => {
		if (!locals.viewer) {
			error(401, "Not signed in");
		}

		const form = await request.formData();
		const passwords = Passwords.safeParse({
			confirmPassword: form.get("confirmPassword") ?? "",
			currentPassword: form.get("currentPassword") ?? "",
			newPassword: form.get("newPassword") ?? "",
		});
		if (!passwords.success) {
			const { fieldErrors } = z.flattenError(passwords.error);

			return fail(400, {
				errors: {
					confirmPassword: fieldErrors.confirmPassword?.[0],
					currentPassword: fieldErrors.currentPassword?.[0],
					newPassword: fieldErrors.newPassword?.[0],
				},
			});
		}

		const { data, error: rejected } = await attempt(
			locals.viewer.sora.changePassword(
				{
					currentPassword: passwords.data.currentPassword,
					newPassword: passwords.data.newPassword,
				},
				{
					headers: {
						"X-Forwarded-For": getClientAddress(),
						"X-Sora-Client-Key": env.WEB_CLIENT_KEY!,
					},
				},
			),
			SoraError,
		);
		if (rejected?.code === "INVALID_PASSWORD") {
			return fail(400, {
				errors: {
					confirmPassword: undefined,
					currentPassword: "That isn't your current password.",
					newPassword: undefined,
				},
			});
		}
		if (rejected?.status === 429) {
			return fail(429, {
				errors: {
					confirmPassword: undefined,
					currentPassword: "Too many attempts. Try again in a minute.",
					newPassword: undefined,
				},
			});
		}
		if (rejected) {
			throw rejected;
		}

		const previous = cookies.get("sora_session");
		if (previous) {
			knownProfiles.delete(previous);
		}
		cookies.set("sora_session", data.token, {
			httpOnly: true,
			maxAge: 90 * 24 * 60 * 60,
			path: "/",
			sameSite: "lax",
		});

		return {
			saved: true,
		};
	},
};
