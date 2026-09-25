import type { SoraClient } from '@sora/sdk';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** The shared Sora API client, available in server hooks, server loads, actions, and endpoints. */
			sora: SoraClient;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
