import { SORA_API_URL, WEB_CLIENT_KEY } from "$app/env/private";
import { knownProfiles, profileCookie } from "$lib/server/sora";
import { handoverKey, startedInPopup } from "$routes/(app)/settings/library/connection";
import { route, SoraClient, SoraError } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { error, redirect } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import type { Handle, HandleServerError } from "@sveltejs/kit/hooks";

/**
 * What the site sends a connection popup back to: nothing of Sora's, only a
 * hand-over of the code to the page that opened it and a closing of itself, so
 * the popup never shows the app.
 */
const handover = () =>
	new Response(
		`<!doctype html><meta charset="utf-8"><title>Sora</title><meta name="color-scheme" content="dark"><body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#000;color:#9a9a9a;font:14px system-ui,sans-serif"><p>Done. You can close this window.</p><script>try{localStorage.setItem(${JSON.stringify(handoverKey)},location.search)}catch{}window.close()</script>`,
		{
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": "text/html; charset=utf-8",
			},
		},
	);

const returnsToPopup = (url: URL) =>
	url.pathname === "/settings/library" &&
	(url.searchParams.has("code") || url.searchParams.has("error")) &&
	startedInPopup(url.search);

const openPaths = ["/api", "/login", "/logout", "/profiles"];

/**
 * Where a page request without a signed-in profile goes. Pages that reset
 * their layout, like the player, skip the app layout's redirect, so the hook
 * has to send everyone there itself instead of letting their queries fail.
 */
const redirectionFor = (event: RequestEvent) => {
	const isPage =
		event.request.method === "GET" &&
		!event.isDataRequest &&
		!event.isRemoteRequest &&
		!openPaths.some((path) => event.url.pathname.startsWith(path));
	if (!isPage) {
		return null;
	}

	const here = encodeURIComponent(event.url.pathname + event.url.search);
	if (!event.locals.viewer) {
		return `/login?redirect=${here}`;
	}
	if (!event.locals.viewer.profile) {
		return `/profiles?redirect=${here}`;
	}
	return null;
};

const listProfiles = async (sora: SoraClient, token: string) => {
	const known = knownProfiles.get(token);
	if (known && Date.now() - known.at < 30_000) {
		return known.profiles;
	}

	const { data, error: listFailure } = await attempt(sora.request(route.listProfiles), SoraError);
	if (listFailure && listFailure.status !== 401) {
		throw listFailure;
	}

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

	return data;
};

const withViewer: Handle = async ({ event, resolve }) => {
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
				event.cookies.set("sora_profile", profile.id, profileCookie);
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

	const destination = redirectionFor(event);
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

export const handle: Handle = (input) =>
	returnsToPopup(input.event.url) ? handover() : withViewer(input);

export const handleError: HandleServerError = ({ error: thrown }) => {
	if (thrown instanceof SoraError) {
		return {
			message: thrown.message,
		};
	}
};
