import { profileCookie } from "$lib/server/sora";
import { route, SoraError } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { error, fail, redirect } from "@sveltejs/kit";
import { z } from "zod";

import type { Actions, PageServerLoad } from "./$types";

const Changes = z.object({
	name: z.string().trim().min(1).max(40),
	avatar: z
		.string()
		.transform((value) => {
			const [style, ...seed] = value.split(":");
			return {
				style,
				seed: seed.join(":"),
			};
		})
		.pipe(
			z.object({
				style: z.enum(["sprouts", "critters"]),
				seed: z.string().trim().min(1).max(64),
			}),
		),
});

export const load: PageServerLoad = ({ locals, params }) => {
	const profile = locals.viewer!.profiles.find((profile) => profile.id === params.id);
	if (!profile) {
		error(404, "No such profile");
	}

	return {
		profile,
		deletable: locals.viewer!.profiles.length > 1,
		choices: Array.from(
			{
				length: 11,
			},
			(_, index) => ({
				style: index % 2 === 0 ? ("critters" as const) : ("sprouts" as const),
				seed: crypto.randomUUID().slice(0, 8),
			}),
		),
	};
};

function profiles(url: URL) {
	const target = url.searchParams.get("redirect");
	return target ? `/profiles?redirect=${encodeURIComponent(target)}` : "/profiles";
}

export const actions: Actions = {
	save: async ({ request, locals, params, url }) => {
		const form = await request.formData();
		const name = String(form.get("name") ?? "");
		const changes = Changes.safeParse({
			name,
			avatar: form.get("avatar"),
		});

		if (!changes.success) {
			return fail(400, {
				name,
				message: "Give the profile a name of up to 40 characters.",
			});
		}

		const updated = await attempt(
			locals.viewer!.sora.request(route.updateProfile, {
				params: {
					profile_id: params.id,
				},
				body: changes.data,
			}),
			SoraError,
		);
		if (updated.error?.status === 404) {
			error(404, "No such profile");
		}
		if (updated.error) {
			throw updated.error;
		}

		redirect(303, profiles(url));
	},

	delete: async ({ locals, params, cookies, url }) => {
		const deleted = await attempt(
			locals.viewer!.sora.request(route.deleteProfile, {
				params: {
					profile_id: params.id,
				},
			}),
			SoraError,
		);
		if (deleted.error?.code === "LAST_PROFILE") {
			return fail(409, {
				message: "An account keeps at least one profile.",
			});
		}
		if (deleted.error?.status === 404) {
			error(404, "No such profile");
		}
		if (deleted.error) {
			throw deleted.error;
		}

		if (locals.viewer!.profile?.id === params.id) {
			cookies.delete(profileCookie, {
				path: "/",
			});
		}

		redirect(303, profiles(url));
	},
};
