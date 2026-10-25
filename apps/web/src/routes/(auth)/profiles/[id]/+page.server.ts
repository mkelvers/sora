import { route, SoraError } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { error, fail, redirect } from "@sveltejs/kit";
import { z } from "zod";

import type { Actions, PageServerLoad } from "./$types";

const Changes = z.object({
	avatar: z
		.string()
		.transform((value) => {
			const [style, ...seed] = value.split(":");
			return {
				seed: seed.join(":"),
				style,
			};
		})
		.pipe(
			z.object({
				seed: z.string().trim().min(1).max(64),
				style: z.enum(["sprouts", "critters"]),
			}),
		),
	name: z.string().trim().min(1).max(40),
});

export const load: PageServerLoad = ({ locals, params }) => {
	if (!locals.viewer) {
		error(401, "Not signed in");
	}
	const { profiles } = locals.viewer;
	const profile = profiles.find((candidate) => candidate.id === params.id);
	if (!profile) {
		error(404, "No such profile");
	}

	return {
		choices: Array.from(
			{
				length: 11,
			},
			(_, index) => ({
				seed: crypto.randomUUID().slice(0, 8),
				style: index % 2 === 0 ? ("critters" as const) : ("sprouts" as const),
			}),
		),
		deletable: profiles.length > 1,
		profile,
	};
};

export const actions: Actions = {
	delete: async ({ locals, params, cookies, url }) => {
		if (!locals.viewer) {
			error(401, "Not signed in");
		}
		const { viewer } = locals;
		const deleted = await attempt(
			viewer.sora.request(route.deleteProfile, {
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

		if (viewer.profile?.id === params.id) {
			cookies.delete("sora_profile", {
				path: "/",
			});
		}

		const target = url.searchParams.get("redirect");
		redirect(303, target ? `/profiles?redirect=${encodeURIComponent(target)}` : "/profiles");
	},

	save: async ({ request, locals, params, url }) => {
		const form = await request.formData();
		const name = String(form.get("name") ?? "");
		const changes = Changes.safeParse({
			avatar: form.get("avatar"),
			name,
		});

		if (!changes.success) {
			return fail(400, {
				message: "Give the profile a name of up to 40 characters.",
				name,
			});
		}

		if (!locals.viewer) {
			error(401, "Not signed in");
		}

		const updated = await attempt(
			locals.viewer.sora.request(route.updateProfile, {
				body: changes.data,
				params: {
					profile_id: params.id,
				},
			}),
			SoraError,
		);
		if (updated.error?.status === 404) {
			error(404, "No such profile");
		}
		if (updated.error) {
			throw updated.error;
		}

		const target = url.searchParams.get("redirect");
		redirect(303, target ? `/profiles?redirect=${encodeURIComponent(target)}` : "/profiles");
	},
};
