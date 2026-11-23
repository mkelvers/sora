import { z } from "zod";

export const AvatarSchema = z
	.object({
		seed: z.string().trim().min(1).max(64).meta({
			description: "The DiceBear seed: the same style and seed always draw the same avatar.",
			example: "7HTQ2LMXB",
		}),
		style: z.enum(["sprouts", "critters"]).meta({
			description: "The animated DiceBear style the avatar is drawn in.",
		}),
	})
	.meta({
		id: "ProfileAvatar",
	});

export const ProfileSchema = z
	.object({
		avatar: AvatarSchema,
		color: z.string().meta({
			description: "A CSS color for the profile's tile.",
			example: "#4f7cff",
		}),
		created_at: z.string(),
		id: z.string().meta({
			example: "7HTQ2LMXB",
		}),
		name: z.string().meta({
			example: "Maja",
		}),
	})
	.meta({
		id: "Profile",
	});

export const ProfileInputSchema = z
	.object({
		avatar: AvatarSchema.optional().meta({
			description: "A sprout seeded with the profile's ID when omitted.",
		}),
		color: z
			.string()
			.regex(/^#[0-9a-f]{6}$/iu)
			.optional()
			.meta({
				description: "A hex color such as `#4f7cff`; picked from a palette when omitted.",
			}),
		name: z.string().trim().min(1).max(40),
	})
	.meta({
		example: {
			name: "Maja",
		},
		id: "ProfileInput",
	});

export type ProfileInput = z.input<typeof ProfileInputSchema>;

export type ProfileAvatar = z.infer<typeof AvatarSchema>;

export type Profile = z.infer<typeof ProfileSchema>;

export const DeviceSchema = z
	.object({
		browser: z.string().nullable().meta({
			description: "The browser's name, when the sign-in said.",
			example: "Firefox",
		}),
		browser_version: z.string().nullable().meta({
			description: "The browser's major version, when the sign-in said.",
			example: "131",
		}),
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
		kind: z.enum(["computer", "phone", "tablet", "tv", "unknown"]).meta({
			description: "What sort of device it is, for an icon.",
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
		system: z.string().nullable().meta({
			description: "The operating system's name, when the sign-in said.",
			example: "macOS",
		}),
		system_version: z.string().nullable().meta({
			description:
				"The operating system's version, only where the browser reports it truthfully (iOS, iPadOS, Android).",
			example: "17.4",
		}),
	})
	.meta({
		id: "SignedInDevice",
	});

export type SignedInDevice = z.infer<typeof DeviceSchema>;
