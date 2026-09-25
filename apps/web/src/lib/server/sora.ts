import { env } from '$env/dynamic/private';
import { SoraClient } from '@sora/sdk';

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
