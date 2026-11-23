import type { AniKoto } from "./anikoto";

/** An opening or ending, in seconds into the episode. */
export interface Span {
	end: number;
	start: number;
}

/** `getSources` as MegaPlay sends it, with the source unencrypted. */
export const sources = (intro: Span | undefined, outro: Span | undefined) =>
	JSON.stringify({
		intro,
		outro,
		server: 4,
		sources: {
			file: "https://cdn.example/master.m3u8",
		},
		t: 1,
		tracks: [],
	});

/** The skip segments shipped with the stream `provider` resolves. */
export const skipSegments = async (
	provider: AniKoto,
	episodeId: string,
	language: "sub" | "dub",
) => {
	const stream = await provider.resolveStream(episodeId, language);

	return stream.skipSegments;
};

/**
 * AniKoto's series API, listing `numbers` with an embed for each language
 * in `languages`. Its episodes default to 56–58 of Naruto: Shippuden, sub only.
 */
export const seriesResponseOf = (
	numbers: readonly number[],
	languages: (number: number) => readonly string[] = () => ["sub"],
) =>
	JSON.stringify({
		data: {
			episodes: numbers.map((number) => ({
				embed_url: Object.fromEntries(
					languages(number).map((language) => [
						language,
						`https://megaplay.buzz/stream/s-2/${7880 + number}/${language}`,
					]),
				),
				episode_embed_id: `${7880 + number}`,
				id: 27_298 + number,
				number,
				title: `Episode ${number}`,
			})),
		},
		ok: true,
	});

/** One link of AniKoto's episode list. `sub` and `dub` default to flagged and unflagged. */
export interface ListedLink {
	className?: string;
	sub?: "0" | "1";
	dub?: "0" | "1";
}

/** AniKoto's episode list, as its watch page loads it, with a link per episode number. */
export const listing = (links: Record<number, ListedLink>) => {
	const items = Object.entries(links).map(([number, link]) => {
		const { className = "", sub = "1", dub = "0" } = link;

		return `<li title="Episode ${number}"><a href="#" data-id="1" data-num="${number}" data-slug="${number}" data-mal="44037" data-timestamp="1729246208" data-sub="${sub}" data-dub="${dub}" data-ids="SmV3" class="${className}" >${number}</a></li>`;
	});

	return JSON.stringify({
		result: `<div class="body"><ul class="ep-range">${items.join("\n")}</ul></div>`,
		status: 200,
	});
};
