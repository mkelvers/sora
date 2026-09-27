import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { SoraClient, SoraError } from '@sora/sdk';

if (!env.SORA_API_URL) {
	throw new Error('SORA_API_URL is not set; see .env.example');
}

export const sora = new SoraClient({
	baseUrl: env.SORA_API_URL
});

export async function fromSora<T>(call: Promise<T>): Promise<T> {
	try {
		return await call;
	} catch (cause) {
		if (cause instanceof SoraError) {
			error(cause.status, cause.message);
		}
		throw cause;
	}
}

export const sessionCookie = 'sora_session';
export const profileCookie = 'sora_profile';

export function soraAs(token: string) {
	return new SoraClient({
		baseUrl: env.SORA_API_URL!,
		headers: {
			Authorization: `Bearer ${token}`
		}
	});
}
