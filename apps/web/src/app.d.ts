import type { Profile, SoraClient } from '@sora/sdk';

declare global {
	namespace App {
		interface Locals {
			viewer: {
				sora: SoraClient;
				profiles: Profile[];
				profile: Profile | null;
			} | null;
		}
	}
}

export { };
