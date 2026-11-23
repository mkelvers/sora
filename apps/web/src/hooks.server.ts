import { SORA_API_URL, WEB_CLIENT_KEY } from "$app/env/private";
import { knownProfiles, listProfiles, profileCookie } from "$lib/server/sora";
import { handoverKey, startedInPopup } from "$routes/(app)/settings/library/connection";
import { SoraClient, SoraError } from "@sora/sdk";
import { error, redirect } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import type { Handle, HandleServerError } from "@sveltejs/kit/hooks";

/** A request on its way in: where it may go, and whether it brings a connection popup back. */
class Visit {
	readonly #event: RequestEvent;

	constructor(event: RequestEvent) {
		this.#event = event;
	}

	/**
	 * Where a page request without a signed-in profile goes. Pages that reset
	 * their layout, like the player, skip the app layout's redirect, so the hook
	 * has to send everyone there itself instead of letting their queries fail.
	 */
	get destination() {
		const openPaths = ["/api", "/login", "/logout", "/profiles"];

		const isPage =
			this.#event.request.method === "GET" &&
			!this.#event.isDataRequest &&
			!this.#event.isRemoteRequest &&
			!openPaths.some((path) => this.#event.url.pathname.startsWith(path));

		if (!isPage) {
			return null;
		}

		const here = encodeURIComponent(this.#event.url.pathname + this.#event.url.search);

		if (!this.#event.locals.viewer) {
			return `/login?redirect=${here}`;
		}

		if (!this.#event.locals.viewer.profile) {
			return `/profiles?redirect=${here}`;
		}

		return null;
	}

	get returnsToPopup() {
		const { url } = this.#event;

		return (
			url.pathname === "/settings/library" &&
			(url.searchParams.has("code") || url.searchParams.has("error")) &&
			startedInPopup(url.search)
		);
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	if (event.route.id === "/live") {
		return resolve(event);
	}

	if (new Visit(event).returnsToPopup) {
		/**
		 * What the site sends a connection popup back to: nothing of Sora's, only a
		 * hand-over of the code to the page that opened it and a closing of itself, so
		 * the popup never shows the app.
		 */
		return new Response(
			`<!doctype html><meta charset="utf-8"><title>Sora</title><meta name="color-scheme" content="dark"><body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#000;color:#9a9a9a;font:14px system-ui,sans-serif"><p>Done. You can close this window.</p><script>try{localStorage.setItem(${JSON.stringify(handoverKey)},location.search)}catch{}window.close()</script>`,
			{
				headers: {
					"Cache-Control": "no-store",
					"Content-Type": "text/html; charset=utf-8",
				},
			},
		);
	}

	event.locals.viewer = null;

	const token = event.cookies.get("sora_session");

	if (token) {
		const sora = new SoraClient({
			baseUrl: SORA_API_URL,
			headers: {
				Authorization: `Bearer ${token}`,
				"X-Sora-Client-Key": WEB_CLIENT_KEY,
			},
		});

		const profiles = await listProfiles(sora, token);

		if (profiles) {
			const chosen = event.cookies.get("sora_profile");
			const profile = profiles.find((candidate) => candidate.id === chosen) ?? null;

			event.locals.viewer = {
				profile,
				profiles,
				sora,
			};

			if (profile) {
				event.cookies.set("sora_profile", profile.id, profileCookie(event.url));
			}
		} else {
			event.cookies.delete("sora_session", {
				path: "/",
				secure: event.url.protocol === "https:",
			});
			event.cookies.delete("sora_profile", {
				path: "/",
				secure: event.url.protocol === "https:",
			});
		}
	}

	const { destination } = new Visit(event);

	if (destination) {
		redirect(303, destination);
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

	const changing = token && !event.isRemoteRequest && event.request.method !== "GET";

	if (changing) {
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
