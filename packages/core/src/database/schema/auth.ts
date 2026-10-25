import { boolean, index, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

import { timestamptz } from "./columns";

/**
 * Tables Better Auth reads and writes through its Drizzle adapter; see
 * `src/auth`. Their columns follow Better Auth's schema and change only with
 * it. Better Auth calls the account its `user`, and a sign-in method its
 * `account`; these tables are prefixed so neither reads as Sora's own.
 */

/** The animated DiceBear styles a profile's avatar may be drawn in. */
export const avatarStyle = pgEnum("avatar_style", ["sprouts", "critters"]);

/**
 * A Sora account: one username and password, shared by its profiles.
 * Better Auth requires an e-mail, so it holds `<username>@sora.invalid`,
 * which is never shown or used.
 */
export const authUser = pgTable("auth_user", {
	createdAt: timestamptz("created_at").notNull().defaultNow(),
	displayUsername: text("display_username").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	id: text("id").primaryKey(),
	image: text("image"),
	name: text("name").notNull(),
	updatedAt: timestamptz("updated_at").notNull().defaultNow(),
	username: text("username").notNull().unique(),
});

/** A signed-in device or browser. The token is what clients present. */
export const authSession = pgTable(
	"auth_session",
	{
		createdAt: timestamptz("created_at").notNull().defaultNow(),
		expiresAt: timestamptz("expires_at").notNull(),
		id: text("id").primaryKey(),
		ipAddress: text("ip_address"),
		token: text("token").notNull().unique(),
		updatedAt: timestamptz("updated_at").notNull().defaultNow(),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => authUser.id, {
				onDelete: "cascade",
			}),
	},
	(table) => [index("auth_session_user_idx").on(table.userId)],
);

/** How an account signs in; for Sora only the hashed password. */
export const authAccount = pgTable(
	"auth_account",
	{
		accessToken: text("access_token"),
		accessTokenExpiresAt: timestamptz("access_token_expires_at"),
		accountId: text("account_id").notNull(),
		createdAt: timestamptz("created_at").notNull().defaultNow(),
		id: text("id").primaryKey(),
		idToken: text("id_token"),
		password: text("password"),
		providerId: text("provider_id").notNull(),
		refreshToken: text("refresh_token"),
		refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
		scope: text("scope"),
		updatedAt: timestamptz("updated_at").notNull().defaultNow(),
		userId: text("user_id")
			.notNull()
			.references(() => authUser.id, {
				onDelete: "cascade",
			}),
	},
	(table) => [index("auth_account_user_idx").on(table.userId)],
);

/** Short-lived codes, such as for resetting a password. */
export const authVerification = pgTable(
	"auth_verification",
	{
		createdAt: timestamptz("created_at").notNull().defaultNow(),
		expiresAt: timestamptz("expires_at").notNull(),
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		updatedAt: timestamptz("updated_at").notNull().defaultNow(),
		value: text("value").notNull(),
	},
	(table) => [index("auth_verification_identifier_idx").on(table.identifier)],
);

/**
 * One viewer under an account, as on Netflix. The library, progress, and
 * history belong to a profile: their `user_id` is a profile ID. An account may hold
 * any number of profiles.
 */
export const profile = pgTable(
	"profile",
	{
		/** The seed of the profile's avatar; new profiles start with their own ID. */
		avatarSeed: text("avatar_seed").notNull(),
		/** The DiceBear style of the profile's avatar. */
		avatarStyle: avatarStyle("avatar_style").notNull(),
		/** A CSS color for the profile's tile, such as `#4f7cff`. */
		color: text("color").notNull(),
		createdAt: timestamptz("created_at").notNull().defaultNow(),
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => authUser.id, {
				onDelete: "cascade",
			}),
	},
	(table) => [index("profile_user_idx").on(table.userId, table.createdAt)],
);
