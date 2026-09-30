import { SoraError, type ArcWatchlist } from "@sora/sdk";
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

		try {
			await locals.viewer!.sora.updateProfile(params.id, changes.data);
		} catch (cause) {
			if (cause instanceof SoraError && cause.status === 404) {
				error(404, "No such profile");
			}
			throw cause;
		}

		redirect(303, `/profiles${url.search}`);
	},
	import: async ({ request, locals, params }) => {
		const file = (await request.formData()).get("watchlist");
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, {
				message: "Choose an Arc watchlist export to import.",
			});
		}

		let watchlist: unknown;
		try {
			watchlist = JSON.parse(await file.text());
		} catch {
			return fail(400, {
				message: "That file isn't an Arc watchlist export.",
			});
		}

		try {
			return {
				imported: await locals.viewer!.sora.importWatchlist(params.id, watchlist as ArcWatchlist),
			};
		} catch (cause) {
			if (cause instanceof SoraError && cause.status === 404) {
				error(404, "No such profile");
			}
			if (cause instanceof SoraError && cause.status === 422) {
				return fail(400, {
					message: "That file isn't an Arc watchlist export.",
				});
			}
			throw cause;
		}
	},
};
