import { boolean, index, pgTable, text } from "drizzle-orm/pg-core";

import { timestamptz } from "./columns";

/**
 * Tables Better Auth reads and writes through its Drizzle adapter; see
 * `src/auth`. Their columns follow Better Auth's schema and change only with
 * it. Better Auth calls the account its `user`, and a sign-in method its
 * `account`; these tables are prefixed so neither reads as Sora's own.
 */

/** A Sora account: one e-mail and password, shared by its profiles. */
export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

/** A signed-in device or browser. The token is what clients present. */
export const authSession = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, {
        onDelete: "cascade",
      }),
    token: text("token").notNull().unique(),
    expiresAt: timestamptz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("auth_session_user_idx").on(table.userId)]
);

/** How an account signs in; for Sora only the hashed password. */
export const authAccount = pgTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, {
        onDelete: "cascade",
      }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("auth_account_user_idx").on(table.userId)]
);

/** Short-lived codes, such as for resetting a password. */
export const authVerification = pgTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("auth_verification_identifier_idx").on(table.identifier)]
);

/**
 * One viewer under an account, as on Netflix. Progress and the watchlist
 * belong to a profile: their `user_id` is a profile ID. An account may hold
 * any number of profiles.
 */
export const profile = pgTable(
  "profile",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, {
        onDelete: "cascade",
      }),
    name: text("name").notNull(),
    /** A CSS color for the profile's tile, such as `#4f7cff`. */
    color: text("color").notNull(),
    /** The seed of the profile's DiceBear avatar; new profiles start with their own ID. */
    avatar: text("avatar").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [index("profile_user_idx").on(table.userId, table.createdAt)]
);
