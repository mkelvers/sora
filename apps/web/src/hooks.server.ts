import { env } from "$env/dynamic/private";
import { profileCookie, sessionCookie } from "$lib/server/sora";
import { route, SoraClient, SoraError, type Profile } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { error, type Handle, type HandleServerError } from "@sveltejs/kit";

const remoteProfilesTtl = 5 * 60_000;
const knownProfiles = new Map<
	string,
	{
		profiles: Profile[];
		at: number;
	}
>();

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.viewer = null;

	const token = event.cookies.get(sessionCookie);
	if (token) {
		const sora = new SoraClient({
			baseUrl: env.SORA_API_URL!,
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		const known = knownProfiles.get(token);
		if (!event.isRemoteRequest || !known || Date.now() - known.at >= remoteProfilesTtl) {
			const { data, error } = await attempt(sora.request(route.listProfiles), SoraError);
			if (error && error.status !== 401) {
				throw error;
			}

			if (knownProfiles.size > 500) {
				knownProfiles.clear();
			}
			if (data) {
				knownProfiles.set(token, {
					profiles: data,
					at: Date.now(),
				});
			} else {
				knownProfiles.delete(token);
			}
		}

		const profiles = knownProfiles.get(token)?.profiles;
		if (profiles) {
			const chosen = event.cookies.get(profileCookie);
			const profile = profiles.find((profile) => profile.id === chosen) ?? null;

			event.locals.viewer = {
				sora,
				profiles,
				profile,
			};

			if (profile) {
				event.cookies.set(profileCookie, profile.id, {
					path: "/",
					httpOnly: true,
					sameSite: "lax",
					maxAge: 60 * 60,
				});
			}
		} else {
			event.cookies.delete(sessionCookie, {
				path: "/",
			});
			event.cookies.delete(profileCookie, {
				path: "/",
			});
		}
	}

	if (event.isRemoteRequest && !event.locals.viewer) {
		error(401, "Not signed in");
	}

	if (event.isRemoteRequest && !event.locals.viewer?.profile) {
		error(403, "Choose a profile first");
	}

	const response = await resolve(event);
	response.headers.set("X-Robots-Tag", "noindex, nofollow");

	return response;
};

export const handleError: HandleServerError = ({ error }) => {
	if (error instanceof SoraError) {
		return {
			message: error.message,
		};
	}
};
