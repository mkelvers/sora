import { z } from "zod";

export const ProfileAvatarSchema = z
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
		avatar: ProfileAvatarSchema,
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
		avatar: ProfileAvatarSchema.optional().meta({
			description: "A sprout seeded with the profile's ID when omitted.",
		}),
		color: z
			.string()
			.regex(/^#[0-9a-f]{6}$/i)
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
export type ProfileAvatar = z.infer<typeof ProfileAvatarSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
