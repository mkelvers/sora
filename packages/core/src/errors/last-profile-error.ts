import { CoreError } from "./core-error";

/** An account must keep at least one profile, so its last one cannot be deleted. */
export class LastProfileError extends CoreError {
	readonly profileId: string;

	constructor(profileId: string) {
		super("LAST_PROFILE", `Profile ${profileId} is the account's last profile`);
		this.name = "LastProfileError";
		this.profileId = profileId;
	}
}
