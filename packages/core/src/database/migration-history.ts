import { readFileSync } from "node:fs";
import path from "node:path";

import { readMigrationFiles } from "drizzle-orm/migrator";
import { z } from "zod";

/** A migration in `packages/core/drizzle`, hashed the way drizzle records it. */
export interface MigrationFile {
	hash: string;
	tag: string;
	when: number;
}

/** A migration as `drizzle.__drizzle_migrations` records it once applied. */
export interface RecordedMigration {
	createdAt: number;
	hash: string;
}

const JournalSchema = z.object({
	entries: z.array(
		z.object({
			tag: z.string(),
			when: z.number(),
		}),
	),
});

/** The migrations in `folder`, in the order drizzle applies them. */
export const readMigrationHistory = (folder: string): MigrationFile[] => {
	const journal = JournalSchema.parse(
		JSON.parse(readFileSync(path.join(folder, "meta/_journal.json"), "utf-8")),
	);
	const tags = new Map(journal.entries.map(({ tag, when }) => [when, tag]));
	return readMigrationFiles({
		migrationsFolder: folder,
	}).map(({ folderMillis, hash }) => ({
		hash,
		tag: tags.get(folderMillis) ?? String(folderMillis),
		when: folderMillis,
	}));
};

/**
 * The migrations in `files` that drizzle's migrator would pass over without
 * saying so, each with why.
 *
 * The migrator only looks at the newest migration recorded and applies the
 * files that are newer. It never compares hashes. So a file edited after it
 * was applied is never applied again, and a file older than a migration
 * another branch applied to the same database is never applied at all.
 * Either leaves the database in a shape the code does not expect, which
 * surfaces later as a failed query. Recorded migrations that have no file,
 * such as another branch's, are left alone.
 */
export const skippedMigrations = (
	files: MigrationFile[],
	recorded: RecordedMigration[],
): string[] => {
	const hashes = new Map(recorded.map(({ createdAt, hash }) => [createdAt, hash]));
	const newest = Math.max(...recorded.map(({ createdAt }) => createdAt));
	return files.flatMap(({ hash, tag, when }) => {
		const applied = hashes.get(when);
		if (applied === undefined) {
			return when < newest
				? [`${tag} was never applied, and a newer migration was, so drizzle never will`]
				: [];
		}
		return applied === hash ? [] : [`${tag} was applied as a different version of its file`];
	});
};
