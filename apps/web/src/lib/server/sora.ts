import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { SoraClient, SoraError } from '@sora/sdk';

if (!env.SORA_API_URL) {
	throw new Error('SORA_API_URL is not set; see .env.example');
}

/**
 * The app's one Sora API client. Modules are evaluated once, so every server
 * load, action, and endpoint that imports it shares this instance.
 */
export const sora = new SoraClient({
	baseUrl: env.SORA_API_URL
});

/** Runs a Sora call, passing its API errors on as the same HTTP errors. */
export async function fromSora<T>(call: () => Promise<T>): Promise<T> {
	try {
		return await call();
	} catch (cause) {
		if (cause instanceof SoraError) {
			error(cause.status, cause.message);
		}
		throw cause;
	}
}

/** The cookie holding the signed-in account's session token. */
export const sessionCookie = 'sora_session';

/** A client that sends a session token, for calls on behalf of a signed-in account. */
export function soraAs(token: string) {
	return new SoraClient({
		baseUrl: env.SORA_API_URL!,
		headers: {
			Authorization: `Bearer ${token}`
		}
	});
}
