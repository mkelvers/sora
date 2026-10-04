import { z } from "zod";

export const ProfileAvatarSchema = z
	.object({
		style: z.enum(["sprouts", "critters"]).meta({
			description: "The animated DiceBear style the avatar is drawn in.",
		}),
		seed: z.string().trim().min(1).max(64).meta({
			description: "The DiceBear seed: the same style and seed always draw the same avatar.",
			example: "7HTQ2LMXB",
		}),
	})
	.meta({
		id: "ProfileAvatar",
	});

export const ProfileSchema = z
	.object({
		id: z.string().meta({
			example: "7HTQ2LMXB",
		}),
		name: z.string().meta({
			example: "Maja",
		}),
		color: z.string().meta({
			description: "A CSS color for the profile's tile.",
			example: "#4f7cff",
		}),
		avatar: ProfileAvatarSchema,
		created_at: z.string(),
	})
	.meta({
		id: "Profile",
	});

export const ProfileInputSchema = z
	.object({
		name: z.string().trim().min(1).max(40),
		color: z
			.string()
			.regex(/^#[0-9a-f]{6}$/i)
			.optional()
			.meta({
				description: "A hex color such as `#4f7cff`; picked from a palette when omitted.",
			}),
		avatar: ProfileAvatarSchema.optional().meta({
			description: "A sprout seeded with the profile's ID when omitted.",
		}),
	})
	.meta({
		id: "ProfileInput",
		example: {
			name: "Maja",
		},
	});

export type ProfileInput = z.input<typeof ProfileInputSchema>;
export type ProfileAvatar = z.infer<typeof ProfileAvatarSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
