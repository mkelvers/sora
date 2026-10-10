import { env } from "$env/dynamic/private";
import { knownProfiles } from "$lib/server/sora";
import { route, SoraClient, SoraError } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { error, type Handle, type HandleServerError } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.viewer = null;

	const token = event.cookies.get("sora_session");
	if (token) {
		const sora = new SoraClient({
			baseUrl: env.SORA_API_URL!,
			headers: {
				Authorization: `Bearer ${token}`,
				"X-Sora-Client-Key": env.WEB_CLIENT_KEY!,
			},
		});

		const known = knownProfiles.get(token);
		let profiles = known?.profiles ?? null;
		if (!known || Date.now() - known.at >= 30_000) {
			const { data, error } = await attempt(sora.request(route.listProfiles), SoraError);
			if (error && error.status !== 401) {
				throw error;
			}

			profiles = data;

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

		if (profiles) {
			const chosen = event.cookies.get("sora_profile");
			const profile = profiles.find((profile) => profile.id === chosen) ?? null;

			event.locals.viewer = {
				sora,
				profiles,
				profile,
			};

			if (profile) {
				event.cookies.set("sora_profile", profile.id, {
					path: "/",
					httpOnly: true,
					sameSite: "lax",
					maxAge: 60 * 60,
				});
			}
		} else {
			event.cookies.delete("sora_session", {
				path: "/",
			});
			event.cookies.delete("sora_profile", {
				path: "/",
			});
		}
	}

	if (event.isRemoteRequest) {
		if (!event.locals.viewer) {
			error(401, "Not signed in");
		}
		if (!event.locals.viewer.profile) {
			error(403, "Choose a profile first");
		}
	}

	const response = await resolve(event);
	if (token && !event.isRemoteRequest && event.request.method !== "GET") {
		knownProfiles.delete(token);
	}
	response.headers.set("X-Robots-Tag", "noindex, nofollow");
	response.headers.set("X-Content-Type-Options", "nosniff");
	response.headers.set("X-Frame-Options", "DENY");
	response.headers.set("Referrer-Policy", "same-origin");
	response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
	response.headers.set(
		"Permissions-Policy",
		"camera=(), microphone=(), geolocation=(), payment=()",
	);
	if (event.url.protocol === "https:") {
		response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
	}

	return response;
};

export const handleError: HandleServerError = ({ error }) => {
	if (error instanceof SoraError) {
		return {
			message: error.message,
		};
	}
};
