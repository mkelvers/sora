/**
 * Accounts, sessions, and profiles.
 *
 * An account signs in with a username or e-mail and password and holds any number of
 * profiles, as on Netflix. What Sora keeps for a viewer, such as playback
 * preferences, is kept per profile: pass a profile ID wherever it asks for
 * a `userId`, after checking the profile belongs to the signed-in account
 * with {@link profiles.get}.
 */
export { auth } from "./auth";

export { devices } from "./devices";

export { type AvatarStyle, profiles } from "./profiles";
