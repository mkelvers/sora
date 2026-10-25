import { CoreError } from "./core-error";

/** The ID does not identify a profile of the signed-in account. */
export class ProfileNotFoundError extends CoreError {
	readonly profileId: string;

	constructor(profileId: string) {
		super("PROFILE_NOT_FOUND", `Profile ${profileId} does not exist`);
		this.name = "ProfileNotFoundError";
		this.profileId = profileId;
	}
}
