import type { Notification } from "../../models/library";

/**
 * When a title is set to start, in words, from AniList's fuzzy `startDate`:
 * "in 2027", "in April 2027", or "on April 4, 2027". Null without one.
 */
export const startsWhen = (startDate: string | null): string | null => {
	const [year, month, dayOfMonth] = (startDate ?? "").split("-").map(Number);

	if (!year) {
		return null;
	}

	if (!month) {
		return `in ${year}`;
	}

	const date = new Date(Date.UTC(year, month - 1, dayOfMonth || 1));

	const format = new Intl.DateTimeFormat("en-US", {
		...(dayOfMonth && {
			day: "numeric",
		}),
		month: "long",
		timeZone: "UTC",
		year: "numeric",
	});

	let preposition = "in";

	if (dayOfMonth) {
		preposition = "on";
	}

	return `${preposition} ${format.format(date)}`;
};

/** What a notification says: the release and what the profile can watch, without promotional copy. */
export class Message {
	readonly #group: Pick<Notification, "kind" | "first_episode" | "last_episode" | "episode_title">;
	readonly #movie: boolean;
	readonly #startDate: string | null;

	constructor(
		group: Pick<Notification, "kind" | "first_episode" | "last_episode" | "episode_title">,
		title: {
			movie: boolean;
			startDate: string | null;
		},
	) {
		this.#group = group;
		this.#movie = title.movie;
		this.#startDate = title.startDate;
	}

	get text(): string {
		const group = this.#group;
		const movie = this.#movie;

		if (group.kind === "announced") {
			return this.#announcement;
		}

		const first = group.first_episode ?? 1;
		const last = group.last_episode ?? first;
		const count = last - first + 1;
		const range = `${first} through ${last}`;
		let episodeTitle = "";

		if (group.episode_title) {
			episodeTitle = `, "${group.episode_title}",`;
		}

		if (group.kind === "dub") {
			if (movie) {
				return "The English dub is now available. You can choose the dubbed version when you start the film.";
			}

			if (count === 1) {
				return `The English dub of episode ${last}${episodeTitle} is now available. You can switch to English audio in the player for this episode.`;
			}

			return `English dubs are now available for episodes ${range}. You can choose English audio in the player for all ${count} episodes.`;
		}

		if (group.kind === "premiere") {
			if (movie) {
				return "The film is now available to watch in Sora. Open its page to see the available audio versions and start watching.";
			}

			if (count > 1) {
				return `The season has started with ${count} episodes available to watch. Episodes ${range} are listed on the season's page.`;
			}

			return `The season has started. Episode 1${episodeTitle} is now available to watch, and you can open the season's page to see its episode list.`;
		}

		if (count > 1) {
			return `${count} new episodes are now available to watch, episodes ${range}. You can find them in the episode list on the season's page.`;
		}

		return `Episode ${last}${episodeTitle} is now available to watch. You can find it in the episode list on the season's page.`;
	}

	get #announcement(): string {
		let announced = "A new season has been announced.";

		if (this.#movie) {
			announced = "A new film has been announced.";
		}

		const starts = startsWhen(this.#startDate);

		if (starts) {
			return `${announced} It is set to start ${starts}.`;
		}

		return `${announced} No start date has been set yet.`;
	}
}
