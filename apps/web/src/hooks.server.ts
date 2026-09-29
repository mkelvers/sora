import { env } from "$env/dynamic/private";
import { profileCookie, sessionCookie } from "$lib/server/sora";
import { SoraClient, SoraError, type Profile } from "@sora/sdk";
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

		try {
			let known = knownProfiles.get(token);
			if (!event.isRemoteRequest || !known || Date.now() - known.at >= remoteProfilesTtl) {
				known = {
					profiles: await sora.profiles(),
					at: Date.now(),
				};
				if (knownProfiles.size > 500) {
					knownProfiles.clear();
				}
				knownProfiles.set(token, known);
			}
			const { profiles } = known;
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
		} catch (cause) {
			if (!(cause instanceof SoraError && cause.status === 401)) {
				throw cause;
			}
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

	return resolve(event);
};

export const handleError: HandleServerError = ({ error }) => {
	if (error instanceof SoraError) {
		return {
			message: error.message,
		};
	}
};
