/**
 * Accounts, sessions, and profiles.
 *
 * An account signs in with e-mail and password and holds any number of
 * profiles, as on Netflix. The library (statuses, progress, history,
 * continue watching) is kept per profile: pass a profile ID wherever it asks for a
 * `userId`, after checking the profile belongs to the signed-in account
 * with {@link getProfile}.
 *
 * @packageDocumentation
 */
export { auth, getSession, type Session } from "./auth";
export {
	createProfile,
	deleteProfile,
	getProfile,
	listProfiles,
	ProfileInputSchema,
	updateProfile,
	type AvatarStyle,
	type Profile,
	type ProfileAvatar,
	type ProfileInput,
} from "./profiles";
