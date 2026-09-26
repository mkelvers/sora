// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Profile, SoraClient } from '@sora/sdk';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** The signed-in viewer, or `null` before signing in. */
			viewer: {
				sora: SoraClient;
				profiles: Profile[];
				profile: Profile | null;
			} | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export { };
