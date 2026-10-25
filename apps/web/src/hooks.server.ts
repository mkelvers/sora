import { env } from "$env/dynamic/private";
import { knownProfiles } from "$lib/server/sora";
import { route, SoraClient, SoraError } from "@sora/sdk";
import { attempt, defined } from "@sora/shared";
import { error } from "@sveltejs/kit";
import type { Handle, HandleServerError } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.viewer = null;

	const token = event.cookies.get("sora_session");
	if (token) {
		const sora = new SoraClient({
			baseUrl: defined(env.SORA_API_URL),
			headers: {
				Authorization: `Bearer ${token}`,
				"X-Sora-Client-Key": defined(env.WEB_CLIENT_KEY),
			},
		});

		const known = knownProfiles.get(token);
		let profiles = known?.profiles ?? null;
		if (!known || Date.now() - known.at >= 30_000) {
			const { data, error: listFailure } = await attempt(
				sora.request(route.listProfiles),
				SoraError,
			);
			if (listFailure && listFailure.status !== 401) {
				throw listFailure;
			}

			profiles = data;

			if (knownProfiles.size > 500) {
				knownProfiles.clear();
			}
			if (data) {
				knownProfiles.set(token, {
					at: Date.now(),
					profiles: data,
				});
			} else {
				knownProfiles.delete(token);
			}
		}

		if (profiles) {
			const chosen = event.cookies.get("sora_profile");
			const profile = profiles.find((candidate) => candidate.id === chosen) ?? null;

			event.locals.viewer = {
				profile,
				profiles,
				sora,
			};

			if (profile) {
				event.cookies.set("sora_profile", profile.id, {
					httpOnly: true,
					maxAge: 60 * 60,
					path: "/",
					sameSite: "lax",
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

export const handleError: HandleServerError = ({ error: thrown }) => {
	if (thrown instanceof SoraError) {
		return {
			message: thrown.message,
		};
	}
};
