import { second } from "@sora/shared";
import { z } from "zod";

import type { Anime } from "../../catalog/models/anime";

/** AnimeThemes' GraphQL API; its REST API is the one that goes down. */
const endpoint = "https://graphql.animethemes.moe/";

const requestTimeoutMs = 20 * second;

/** An opening or ending song of an anime, as AnimeThemes has it. */
export interface ThemeSong {
	kind: "opening" | "ending";
	/** Like `OP1` or `ED2`. */
	slug: string;
	/** The episodes it plays in, as AnimeThemes writes them, like `1-12, 14`; `null` when not given. */
	episodes: string | null;
	/** The song's audio, from its creditless video when there is one. */
	audioUrl: string;
}

const ResponseSchema = z.object({
	data: z.object({
		findAnimeByExternalSite: z.array(
			z.object({
				animethemes: z.array(
					z.object({
						animethemeentries: z.array(
							z.object({
								episodes: z.string().nullable(),
								version: z.number().nullable(),
								videos: z.object({
									nodes: z.array(
										z.object({
											audio: z
												.object({
													link: z.url(),
												})
												.nullable(),
											nc: z.boolean(),
										}),
									),
								}),
							}),
						),
						slug: z.string(),
						type: z.string().nullable(),
					}),
				),
			}),
		),
	}),
});

const query = `query ($id: [Int!]) {
  findAnimeByExternalSite(site: ANILIST, id: $id) {
    animethemes {
      type
      slug
      animethemeentries {
        episodes
        version
        videos { nodes { nc audio { link } } }
      }
    }
  }
}`;

/**
 * Every opening and ending AnimeThemes has for an AniList anime, one per
 * version of a song. Empty when AnimeThemes does not have the anime.
 *
 * @throws {Error} when AnimeThemes cannot be reached or answers unexpectedly.
 */
export const fetchThemeSongs = async (anilistId: number): Promise<ThemeSong[]> => {
	const response = await fetch(endpoint, {
		body: JSON.stringify({
			query,
			variables: {
				id: [anilistId],
			},
		}),
		headers: {
			"Content-Type": "application/json",
			"User-Agent": "Sora",
		},
		method: "POST",
		signal: AbortSignal.timeout(requestTimeoutMs),
	});
	if (!response.ok) {
		throw new Error(`AnimeThemes answered ${response.status}`);
	}

	const body = ResponseSchema.parse(await response.json());
	const songs: ThemeSong[] = [];
	for (const anime of body.data.findAnimeByExternalSite) {
		for (const theme of anime.animethemes) {
			if (theme.type !== "OP" && theme.type !== "ED") {
				continue;
			}
			for (const entry of theme.animethemeentries) {
				const videos = entry.videos.nodes;
				const audio = (videos.find((video) => video.nc) ?? videos[0])?.audio;
				if (!audio || songs.some((song) => song.audioUrl === audio.link)) {
					continue;
				}
				songs.push({
					audioUrl: audio.link,
					episodes: entry.episodes,
					kind: theme.type === "OP" ? "opening" : "ending",
					slug: entry.version && entry.version > 1 ? `${theme.slug}v${entry.version}` : theme.slug,
				});
			}
		}
	}
	return songs;
};

/**
 * Whether `episode` is among `episodes` as AnimeThemes writes them: ranges
 * like `1-12`, open ranges like `1206-`, and single numbers, separated by
 * commas. A song without episodes plays in all of them.
 */
export const playsIn = (episodes: string | null, episode: number) => {
	if (!episodes?.trim()) {
		return true;
	}
	return episodes.split(/[,;]/u).some((part) => {
		const range = /^\s*(?<from>\d+)\s*-\s*(?<to>\d*)\s*$/u.exec(part)?.groups;
		if (range) {
			return Number(range.from) <= episode && (!range.to || episode <= Number(range.to));
		}
		return Number(part.trim()) === episode;
	});
};

/** The most songs of a kind tried when none is listed for the episode. */
const unlistedLimit = 8;

/**
 * The songs to look for in an episode: the ones AnimeThemes lists for it, and
 * of a kind none is listed for, every song of that kind, since AnimeThemes'
 * episode lists are often unfinished. A long-running anime with many songs
 * and none listed for the episode gets none of that kind, rather than dozens.
 */
export const songsForEpisode = (songs: ThemeSong[], episode: number) =>
	(["opening", "ending"] as const).flatMap((kind) => {
		const ofKind = songs.filter((song) => song.kind === kind);
		const listed = ofKind.filter((song) => playsIn(song.episodes, episode));
		if (listed.length > 0) {
			return listed;
		}
		return ofKind.length <= unlistedLimit ? ofKind : [];
	});

/**
 * The songs to look for in an anime's episode. A provider can file a sequel's
 * episodes under the anime, numbered on from its last, so an episode past
 * the anime's count is looked up in its sequel.
 *
 * @throws {Error} when AnimeThemes cannot be reached.
 */
export const themeSongsFor = async (anime: Anime, episode: number) => {
	const sequels = anime.relations.filter((relation) => relation.type === "SEQUEL");
	// A season goes on in a series, not in a film or a special.
	const sequel =
		sequels.find(({ anime: next }) => next.format === "TV" || next.format === "ONA") ?? sequels[0];
	if (anime.episodes && episode > anime.episodes && sequel) {
		return songsForEpisode(await fetchThemeSongs(sequel.anime.id), episode - anime.episodes);
	}
	return songsForEpisode(await fetchThemeSongs(anime.id), episode);
};
