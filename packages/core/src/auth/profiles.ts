import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/client";
import { playbackProgress, profile, watchlistEntry } from "../database/schema";
import { InvalidInputError, LastProfileError, ProfileNotFoundError } from "../errors";
import { newId } from "../ids";

/** One viewer under an account. */
export interface Profile {
  /** Sora's profile ID, such as `GYZJ43JMR`. */
  id: string;
  name: string;
  /** A CSS color for the profile's tile. */
  color: string;
  /** The seed of the profile's avatar: DiceBear's "thumbs" style, drawn by clients. */
  avatar: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/** Tile colors, handed out in turn to new profiles. */
const palette = ["#4f7cff", "#e5484d", "#30a46c", "#f5a524", "#8e4ec6", "#12a594", "#e54666", "#3e63dd"];

export const ProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  avatar: z.string().trim().min(1).max(64).optional()
});

export type ProfileInput = z.input<typeof ProfileInputSchema>;

/** Lists an account's profiles, oldest first. */
export async function listProfiles(userId: string): Promise<Profile[]> {
  const rows = await db.select().from(profile).where(eq(profile.userId, userId)).orderBy(asc(profile.createdAt), asc(profile.id));
  return rows.map(toProfile);
}

/**
 * Loads one of an account's profiles.
 *
 * @throws {@link ProfileNotFoundError} when the account has no such profile.
 */
export async function getProfile(userId: string, profileId: string): Promise<Profile> {
  const [row] = await db
    .select()
    .from(profile)
    .where(and(eq(profile.id, profileId), eq(profile.userId, userId)))
    .limit(1);
  if (!row) {
    throw new ProfileNotFoundError(profileId);
  }

  return toProfile(row);
}

/**
 * Adds a profile to an account; there is no limit. Without a color, the
 * next one from the palette is used.
 *
 * @throws {@link InvalidInputError} when the input fails {@link ProfileInputSchema}.
 */
export async function createProfile(userId: string, input: ProfileInput): Promise<Profile> {
  const { name, color, avatar } = parse(ProfileInputSchema, input);
  const id = newId();
  const [existing] = await db
    .select({
      total: count()
    })
    .from(profile)
    .where(eq(profile.userId, userId));

  const [row] = await db
    .insert(profile)
    .values({
      id,
      userId,
      name,
      color: color ?? palette[(existing?.total ?? 0) % palette.length]!,
      avatar: avatar ?? id
    })
    .returning();

  return toProfile(row!);
}

/**
 * Renames a profile, or changes its color or avatar.
 *
 * @throws {@link InvalidInputError} when the input is invalid.
 * @throws {@link ProfileNotFoundError} when the account has no such profile.
 */
export async function updateProfile(userId: string, profileId: string, input: Partial<ProfileInput>): Promise<Profile> {
  const changes = parse(ProfileInputSchema.partial(), input);
  const [row] = await db
    .update(profile)
    .set(changes)
    .where(and(eq(profile.id, profileId), eq(profile.userId, userId)))
    .returning();
  if (!row) {
    throw new ProfileNotFoundError(profileId);
  }

  return toProfile(row);
}

/**
 * Deletes a profile with its progress and watchlist.
 *
 * @throws {@link ProfileNotFoundError} when the account has no such profile.
 * @throws {@link LastProfileError} when it is the account's only profile.
 */
export async function deleteProfile(userId: string, profileId: string) {
  await getProfile(userId, profileId);
  await db.transaction(async (tx) => {
    // Locks the account's profiles, so two deletions at once cannot remove the last two.
    const profiles = await tx.select({ id: profile.id }).from(profile).where(eq(profile.userId, userId)).for("update");
    if (profiles.length <= 1) {
      throw new LastProfileError(profileId);
    }

    await tx.delete(playbackProgress).where(eq(playbackProgress.userId, profileId));
    await tx.delete(watchlistEntry).where(eq(watchlistEntry.userId, profileId));
    await tx.delete(profile).where(eq(profile.id, profileId));
  });
}

function parse<TSchema extends z.ZodType>(schema: TSchema, input: unknown): z.output<TSchema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidInputError("Invalid profile", {
      cause: parsed.error
    });
  }

  return parsed.data;
}

function toProfile(row: typeof profile.$inferSelect): Profile {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    avatar: row.avatar,
    createdAt: row.createdAt.toISOString()
  };
}
