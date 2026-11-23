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
	 * Adds a track's kind or alternate designation to its label, inside any
	 * parentheses it already has: `English (CC)`, `Portuguese (Brazil, CC)`.
	 */
	static qualify(label: string, qualifier: string) {
		if (label.endsWith(")")) {
			return `${label.slice(0, -1)}, ${qualifier})`;
		}

		return `${label} (${qualifier})`;
	}

	/**
	 * The tracks sorted for the menu of a version with `audio`, English first,
	 * then by how much of what is said each carries, then by label, with the
	 * first, when English, marked as the one a player shows from the start.
	 * Tracks that share a label are told apart as `English (Alternate)`,
	 * `English (Alternate 2)` and so on.
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
		const named = new Map<string, number>();

		return this.#subtitles
			.toSorted(
				(left, right) =>
					Number(isServedSubtitle(right)) - Number(isServedSubtitle(left)) ||
					ranks[left.kind ?? "dialogue"] - ranks[right.kind ?? "dialogue"] ||
					left.label.localeCompare(right.label),
			)
			.map((track, index) => {
				const count = (named.get(track.label) ?? 0) + 1;
				named.set(track.label, count);

				let { label } = track;

				if (count === 2) {
					label = Menu.qualify(track.label, "Alternate");
				} else if (count > 2) {
					label = Menu.qualify(track.label, `Alternate ${count - 1}`);
				}

				return {
					...track,
					default: index === 0 && isServedSubtitle(track),
					label,
				};
			});
	}
}
