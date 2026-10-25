import { defined } from "@sora/shared";
import { and, asc, count, eq } from "drizzle-orm";
import type { z } from "zod";

import { db } from "../database/client";
import type { avatarStyle } from "../database/schema/auth";
import { profile } from "../database/schema/auth";
import {
	episodeProgress,
	featuredPick,
	notificationDismissal,
	notificationRead,
	playbackPreference,
	seriesState,
} from "../database/schema/library";
import { InvalidInputError, LastProfileError, ProfileNotFoundError } from "../errors";
import { newId } from "../ids";
import { ProfileInputSchema } from "../models/profile";
import type { Profile, ProfileInput } from "../models/profile";

export type AvatarStyle = (typeof avatarStyle.enumValues)[number];

/** Tile colors, handed out in turn to new profiles. */
const palette = [
	"#4f7cff",
	"#e5484d",
	"#30a46c",
	"#f5a524",
	"#8e4ec6",
	"#12a594",
	"#e54666",
	"#3e63dd",
];

const toProfile = (row: typeof profile.$inferSelect): Profile => ({
	avatar: {
		seed: row.avatarSeed,
		style: row.avatarStyle,
	},
	color: row.color,
	created_at: row.createdAt.toISOString(),
	id: row.id,
	name: row.name,
});

/** Lists an account's profiles, oldest first. */
export const listProfiles = async (userId: string): Promise<Profile[]> => {
	const rows = await db
		.select()
		.from(profile)
		.where(eq(profile.userId, userId))
		.orderBy(asc(profile.createdAt), asc(profile.id));
	return rows.map(toProfile);
};

/**
 * Loads one of an account's profiles.
 *
 * @throws {ProfileNotFoundError} when the account has no such profile.
 */
export const getProfile = async (userId: string, profileId: string): Promise<Profile> => {
	const [row] = await db
		.select()
		.from(profile)
		.where(and(eq(profile.id, profileId), eq(profile.userId, userId)))
		.limit(1);
	if (!row) {
		throw new ProfileNotFoundError(profileId);
	}

	return toProfile(row);
};

const parse = <TSchema extends z.ZodType>(schema: TSchema, input: unknown): z.output<TSchema> => {
	const parsed = schema.safeParse(input);
	if (!parsed.success) {
		throw new InvalidInputError("Invalid profile", {
			cause: parsed.error,
		});
	}

	return parsed.data;
};

/**
 * Adds a profile to an account; there is no limit. Without a color, the
 * next one from the palette is used; without an avatar, a sprout seeded
 * with the profile's ID.
 *
 * @throws {InvalidInputError} when the input fails {@link ProfileInputSchema}.
 */
export const createProfile = async (userId: string, input: ProfileInput): Promise<Profile> => {
	const { name, color, avatar } = parse(ProfileInputSchema, input);
	const id = newId();
	const [existing] = await db
		.select({
			total: count(),
		})
		.from(profile)
		.where(eq(profile.userId, userId));

	const [row] = await db
		.insert(profile)
		.values({
			avatarSeed: avatar?.seed ?? id,
			avatarStyle: avatar?.style ?? "sprouts",
			color: color ?? defined(palette[(existing?.total ?? 0) % palette.length]),
			id,
			name,
			userId,
		})
		.returning();

	return toProfile(defined(row));
};

/**
 * Renames a profile, or changes its color or avatar.
 *
 * @throws {InvalidInputError} when the input is invalid.
 * @throws {ProfileNotFoundError} when the account has no such profile.
 */
export const updateProfile = async (
	userId: string,
	profileId: string,
	input: Partial<ProfileInput>,
): Promise<Profile> => {
	const { avatar, ...changes } = parse(ProfileInputSchema.partial(), input);
	const [row] = await db
		.update(profile)
		.set({
			...changes,
			...(avatar && {
				avatarSeed: avatar.seed,
				avatarStyle: avatar.style,
			}),
		})
		.where(and(eq(profile.id, profileId), eq(profile.userId, userId)))
		.returning();
	if (!row) {
		throw new ProfileNotFoundError(profileId);
	}

	return toProfile(row);
};

/**
 * Deletes a profile with its watchlist, progress, rewatches, preferences,
 * and featured titles.
 *
 * @throws {ProfileNotFoundError} when the account has no such profile.
 * @throws {LastProfileError} when it is the account's only profile.
 */
export const deleteProfile = async (userId: string, profileId: string) => {
	await getProfile(userId, profileId);
	await db.transaction(async (tx) => {
		// Locks the account's profiles, so two deletions at once cannot remove the last two.
		const profiles = await tx
			.select({
				id: profile.id,
			})
			.from(profile)
			.where(eq(profile.userId, userId))
			.for("update");
		if (profiles.length <= 1) {
			throw new LastProfileError(profileId);
		}

		await tx.delete(episodeProgress).where(eq(episodeProgress.userId, profileId));
		await tx.delete(seriesState).where(eq(seriesState.userId, profileId));
		await tx.delete(notificationRead).where(eq(notificationRead.userId, profileId));
		await tx.delete(notificationDismissal).where(eq(notificationDismissal.userId, profileId));
		await tx.delete(playbackPreference).where(eq(playbackPreference.userId, profileId));
		await tx.delete(featuredPick).where(eq(featuredPick.userId, profileId));
		await tx.delete(profile).where(eq(profile.id, profileId));
	});
};
