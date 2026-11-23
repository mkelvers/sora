import { SORA_API_URL } from "$app/env/private";
import { getRequestEvent } from "$app/server";
import { route, SoraClient, SoraError } from "@sora/sdk";
import type { Profile } from "@sora/sdk";
import { attempt, defined } from "@sora/shared";

export const sora = new SoraClient({
	baseUrl: SORA_API_URL,
});

/**
 * The chosen profile outlives idle time: it lasts as long as the sign-in does,
 * so a paused tab never comes back without one.
 */
export const profileCookie = (url: URL) =>
	({
		httpOnly: true,
		maxAge: 90 * 24 * 60 * 60,
		path: "/",
		sameSite: "lax",
		secure: url.protocol === "https:",
	}) as const;

export const knownProfiles = new Map<
	string,
	{
		profiles: Profile[];
		at: number;
	}
>();

/** The account's profiles, kept for a while per session token; `null` when the token is no longer signed in. */
export const listProfiles = async (client: SoraClient, token: string) => {
	const known = knownProfiles.get(token);

	if (known && Date.now() - known.at < 30_000) {
		return known.profiles;
	}

	const { data, error: listFailure } = await attempt(client.request(route.listProfiles), SoraError);

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

export const remoteViewer = () => {
	const viewer = defined(getRequestEvent().locals.viewer);

	return {
		profile: defined(viewer.profile),
		sora: viewer.sora,
	};
};
