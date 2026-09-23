/**
 * Persistence schema for the core.
 *
 * @remarks
 * Anime metadata is not duplicated into relational tables. AniList stays the
 * source of truth and responses are cached as snapshots, so a schema change
 * upstream means regenerating the GraphQL types, not migrating data.
 *
 * User IDs are opaque strings owned by whichever identity layer sits in front
 * of the core (Better Auth, an OAuth gateway, a device pairing flow). The core
 * never stores credentials.
 */
export * from "./catalog";
export * from "./library";
export * from "./playback";
export * from "./series";
