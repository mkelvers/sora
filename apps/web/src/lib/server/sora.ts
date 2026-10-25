import { SORA_API_URL } from "$app/env/private";
import { getRequestEvent } from "$app/server";
import { SoraClient } from "@sora/sdk";
import type { Profile } from "@sora/sdk";
import { defined } from "@sora/shared";

export const sora = new SoraClient({
	baseUrl: SORA_API_URL,
});

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
