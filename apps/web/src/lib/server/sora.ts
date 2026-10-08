import { getRequestEvent } from "$app/server";
import { env } from "$env/dynamic/private";
import { SoraClient, type Profile } from "@sora/sdk";

export const sora = new SoraClient({
	baseUrl: env.SORA_API_URL!,
});

export const knownProfiles = new Map<
	string,
	{
		profiles: Profile[];
		at: number;
	}
>();

export function remoteViewer() {
	const viewer = getRequestEvent().locals.viewer!;
	return {
		sora: viewer.sora,
		profile: viewer.profile!,
	};
}
