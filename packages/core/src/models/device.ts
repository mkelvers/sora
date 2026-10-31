import { z } from "zod";

export const SignedInDeviceSchema = z
	.object({
		current: z.boolean().meta({
			description: "Whether this is the device the request came from.",
		}),
		device: z.string().meta({
			description: "The browser and system it signed in with, as people name them.",
			example: "Safari on iPad",
		}),
		id: z.string().meta({
			description: "Names the sign-in; `signOutDevice` ends it.",
		}),
		ip_address: z.string().nullable().meta({
			description: "The address it signed in from, when known.",
			example: "203.0.113.7",
		}),
		last_active_at: z.string().meta({
			description:
				"When it last used the account, as an ISO 8601 timestamp. Kept up to a day behind.",
			example: "2026-10-31T10:00:00.000Z",
		}),
		signed_in_at: z.string().meta({
			description: "When it signed in, as an ISO 8601 timestamp.",
			example: "2026-10-01T18:00:00.000Z",
		}),
	})
	.meta({
		id: "SignedInDevice",
	});

export type SignedInDevice = z.infer<typeof SignedInDeviceSchema>;
