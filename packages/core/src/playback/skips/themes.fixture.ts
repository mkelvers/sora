import type { ThemeSong } from "./themes";

/** A song AnimeThemes lists for `episodes`. */
export const song = (
	kind: ThemeSong["kind"],
	slug: string,
	episodes: string | null,
): ThemeSong => ({
	audioUrl: `https://a.animethemes.moe/${slug}.ogg`,
	episodes,
	kind,
	slug,
});
