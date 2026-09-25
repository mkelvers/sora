import { env } from '$env/dynamic/private';
import { SoraClient } from '@sora/sdk';

if (!env.SORA_API_URL) {
	throw new Error('SORA_API_URL is not set; see .env.example');
}

/**
 * The app's one Sora API client. It holds no per-request state, so every request
 * shares it; routes reach it as `locals.sora`, set in `hooks.server.ts`.
 */
export const sora = new SoraClient({ baseUrl: env.SORA_API_URL });
