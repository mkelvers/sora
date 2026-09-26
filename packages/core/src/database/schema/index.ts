/**
 * Persistence schema for the core.
 *
 * @remarks
 * Anime metadata is not split into relational columns. Each anime is stored
 * as the AniList fragment it was fetched with, so a schema change upstream
 * means regenerating the GraphQL types, not migrating data.
 *
 * Library rows (progress, watchlist) are keyed by a `user_id` that holds a
 * profile ID; see {@link profile}. Accounts, sessions, and hashed passwords
 * live in the `auth_*` tables, which Better Auth manages.
 */
export * from "./auth";
export * from "./catalog";
export * from "./library";
export * from "./playback";
export * from "./series";
