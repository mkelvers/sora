import type { PlaybackSubtitle } from "../../models/playback";
import { isServedSubtitle } from "../providers/registry";
import type { SubtitleKind } from "./subtitle-kind";

/** A version's subtitle tracks, as a player lists them. */
export class Menu {
	readonly #subtitles: PlaybackSubtitle[];

	constructor(subtitles: PlaybackSubtitle[]) {
		this.#subtitles = subtitles;
	}

	/**
	 * The tracks sorted for the menu of a version with `audio`, English first,
	 * then by how much of what is said each carries, then by label, with the
	 * first, when English, marked as the one a player shows from the start.
	 */
	ordered(audio: "sub" | "dub") {
		/**
		 * Each kind's place in a subtitle menu, by how much of what is said it
		 * carries. A dub's own captions write down its speech, while its dialogue is
		 * the sub's translation moved onto its timeline, so they come first on a dub.
		 * Signs carry no speech. An unclear kind counts as dialogue.
		 */
		const kindRanks: Record<"sub" | "dub", Record<SubtitleKind, number>> = {
			dub: {
				captions: 0,
				dialogue: 1,
				signs: 2,
			},
			sub: {
				captions: 1,
				dialogue: 0,
				signs: 2,
			},
		};

		const ranks = kindRanks[audio];

		return this.#subtitles
			.toSorted(
				(left, right) =>
					Number(isServedSubtitle(right)) - Number(isServedSubtitle(left)) ||
					ranks[left.kind ?? "dialogue"] - ranks[right.kind ?? "dialogue"] ||
					left.label.localeCompare(right.label),
			)
			.map((track, index) => ({
				...track,
				default: index === 0 && isServedSubtitle(track),
			}));
	}
}
