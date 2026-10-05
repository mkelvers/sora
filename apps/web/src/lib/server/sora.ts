import { getRequestEvent } from "$app/server";
import { env } from "$env/dynamic/private";
import { SoraClient, type Profile } from "@sora/sdk";

if (!env.SORA_API_URL) {
	throw new Error("SORA_API_URL is not set; see .env.example");
}

if (!env.WEB_CLIENT_KEY) {
	throw new Error("WEB_CLIENT_KEY is not set; see .env.example");
}

export const sora = new SoraClient({
	baseUrl: env.SORA_API_URL,
});

export const knownProfiles = new Map<
	string,
	{
		profiles: Profile[];
		at: number;
	}
>();

export const sessionCookie = "sora_session";
export const profileCookie = "sora_profile";

export function remoteViewer() {
	const { viewer } = getRequestEvent().locals;
	return {
		sora: viewer!.sora,
		profile: viewer!.profile!,
	};
}
