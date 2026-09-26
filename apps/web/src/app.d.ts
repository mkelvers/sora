// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Profile, SoraClient } from '@sora/sdk';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** The signed-in viewer, or `null` before signing in. */
			viewer: {
				/** A client that acts as the signed-in account. */
				sora: SoraClient;
				/** The account's first profile; there is no profile picker yet. */
				profile: Profile;
			} | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export { };
