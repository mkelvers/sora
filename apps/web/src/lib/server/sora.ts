import { SORA_API_URL } from "$app/env/private";
import { getRequestEvent } from "$app/server";
import { SoraClient } from "@sora/sdk";
import type { Profile } from "@sora/sdk";
import { defined } from "@sora/shared";

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

export const remoteViewer = () => {
	const viewer = defined(getRequestEvent().locals.viewer);
	return {
		profile: defined(viewer.profile),
		sora: viewer.sora,
	};
};
