import { env } from "$env/dynamic/private";
import { knownProfiles } from "$lib/server/sora";
import { SoraError } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { error, fail } from "@sveltejs/kit";
import { z } from "zod";

import type { Actions } from "./$types";

const Passwords = z
	.object({
		currentPassword: z.string().min(1, "Enter your current password."),
		newPassword: z.string().min(8, "Use at least 8 characters."),
		confirmPassword: z.string(),
	})
	.refine((passwords) => passwords.newPassword === passwords.confirmPassword, {
		path: ["confirmPassword"],
		message: "The passwords don't match.",
	})
	.refine((passwords) => passwords.newPassword !== passwords.currentPassword, {
		path: ["newPassword"],
		message: "Choose a password you aren't using now.",
	});

export const actions: Actions = {
	default: async ({ request, locals, cookies, getClientAddress }) => {
		if (!locals.viewer) {
			error(401, "Not signed in");
		}

		const form = await request.formData();
		const passwords = Passwords.safeParse({
			currentPassword: form.get("currentPassword") ?? "",
			newPassword: form.get("newPassword") ?? "",
			confirmPassword: form.get("confirmPassword") ?? "",
		});
		if (!passwords.success) {
			const { fieldErrors } = z.flattenError(passwords.error);

			return fail(400, {
				errors: {
					currentPassword: fieldErrors.currentPassword?.[0],
					newPassword: fieldErrors.newPassword?.[0],
					confirmPassword: fieldErrors.confirmPassword?.[0],
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
					currentPassword: "That isn't your current password.",
					newPassword: undefined,
					confirmPassword: undefined,
				},
			});
		}
		if (rejected?.status === 429) {
			return fail(429, {
				errors: {
					currentPassword: "Too many attempts. Try again in a minute.",
					newPassword: undefined,
					confirmPassword: undefined,
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
			path: "/",
			httpOnly: true,
			sameSite: "lax",
			maxAge: 90 * 24 * 60 * 60,
		});

		return {
			saved: true,
		};
	},
};
