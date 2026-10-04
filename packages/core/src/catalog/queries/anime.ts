import { eq, inArray } from "drizzle-orm";

import { anilist, loadMediaById } from "../../anilist/client";
import {
	AnimeDetailsDocument,
	LatestAiringDocument,
	type AnimeDetailsFragment,
} from "../../anilist/graphql.generated";
import { db } from "../../database/client";
import { anime as animeTable } from "../../database/schema";
import { AnimeNotFoundError } from "../../errors";
import { startTrackingAiring } from "../../scheduler/queue";
import { day, hour } from "../../time";
import { toAnime, toAnimeCard, type Anime, type AnimeCard } from "../models/anime";
import { fromUnixSeconds } from "../models/text";
import type { AiringBroadcast } from "./schedule";

/**
 * Loads the full details of one anime.
 *
 * The first request fetches the anime from AniList and stores it for good;
 * every later request is served from the database. An anime that is still
 * airing, or finished recently, is handed to the airing scheduler, which keeps
 * the stored copy current until its final episode is out.
 *
 * @throws {@link AnimeNotFoundError} when the ID is unknown to AniList, or
 *   belongs to adult media, which the catalog never serves.
 * @throws {@link UpstreamUnavailableError} when the anime is not stored yet
 *   and AniList cannot be reached.
 */
export async function getAnime(anilistId: number): Promise<Anime> {
	const [stored] = await db
		.select({
			media: animeTable.media,
		})
		.from(animeTable)
		.where(eq(animeTable.anilistId, anilistId))
		.limit(1);

	if (stored) {
		return toAnime(stored.media);
	}

	const media = await fetchAnimeDetails(anilistId);
	await db.insert(animeTable).values(storedAnimeValues(media)).onConflictDoNothing();

	if (mayGainEpisodes(media, new Date())) {
		await startTrackingAiring(anilistId);
	}

	return toAnime(media);
}

/**
 * Fetches an anime from AniList again and overwrites the stored copy.
 *
 * Only the airing scheduler calls this; nothing else updates a stored anime.
 *
 * @throws {@link AnimeNotFoundError} when AniList no longer serves the anime.
 * @throws {@link UpstreamUnavailableError} when AniList cannot be reached.
 */
export async function refreshAnime(anilistId: number): Promise<Anime> {
	const media = await fetchAnimeDetails(anilistId);
	const values = storedAnimeValues(media);
	await db
		.insert(animeTable)
		.values(values)
		.onConflictDoUpdate({
			target: animeTable.anilistId,
			set: {
				media: values.media,
				status: values.status,
				refreshedAt: values.refreshedAt,
			},
		});

	return toAnime(media);
}

/**
 * Finales often reach providers a day or more after they air, while AniList
 * marks the anime finished right away. An anime that finished within this
 * window is still tracked until its last episode is released.
 */
const recentlyFinishedMs = 14 * day;

/**
 * Whether the airing scheduler needs to follow an anime: it is still airing,
 * or finished so recently that providers may not carry every episode yet.
 */
export function mayGainEpisodes(
	media: Pick<AnimeDetailsFragment, "status" | "endDate">,
	now: Date,
) {
	switch (media.status) {
		case "RELEASING":
		case "NOT_YET_RELEASED":
		case "HIATUS":
			return true;
		case "FINISHED": {
			const end = media.endDate;
			if (!end?.year || !end.month || !end.day) {
				return false;
			}

			return now.getTime() - Date.UTC(end.year, end.month - 1, end.day) < recentlyFinishedMs;
		}
		default:
			return false;
	}
}

/**
 * Cards for the anime among `ids` that the catalog has stored, by AniList ID.
 * Anime that are not stored are left out; nothing is fetched.
 *
 * The airing scheduler keeps stored anime current, so these are fresher
 * than stored AniList responses for anime that are still airing.
 */
export async function getStoredAnimeCards(ids: readonly number[]): Promise<Map<number, AnimeCard>> {
	if (ids.length === 0) {
		return new Map();
	}

	const rows = await db
		.select({
			media: animeTable.media,
		})
		.from(animeTable)
		.where(inArray(animeTable.anilistId, [...new Set(ids)]));

	return new Map(rows.map((row) => [row.media.id, toAnimeCard(row.media)]));
}

/**
 * Loads anime details by ID, up to 200 to a request shared by every caller
 * that asks while it waits its turn; see {@link loadMediaById}. Layouts and
 * airing checks each ask for one anime, so running at once they share a
 * request rather than spend one each.
 */
const loadAnimeDetails = loadMediaById({
	document: AnimeDetailsDocument,
	pages: 4,
	variables: ([ids0 = [], ids1 = [], ids2 = [], ids3 = []]) => ({
		ids0,
		ids1,
		ids2,
		ids3,
		with1: ids1.length > 0,
		with2: ids2.length > 0,
		with3: ids3.length > 0,
	}),
	media: ({ page0, page1, page2, page3 }) =>
		[page0, page1, page2, page3].flatMap((page) => page?.media ?? []),
});

/**
 * The latest broadcast of an AniList entry that AniList's airing schedule
 * says has aired, or `null` when it records none.
 *
 * Unlike the entry's next airing episode, this still knows an episode aired
 * when AniList has nothing announced after it, or moved its broadcast.
 *
 * @throws {@link UpstreamUnavailableError} when AniList cannot be reached.
 */
export async function fetchLatestAiring(anilistId: number): Promise<AiringBroadcast | null> {
	const { Page } = await anilist(
		LatestAiringDocument,
		{
			id: anilistId,
		},
		{
			maxAgeMs: 0,
		},
	);
	const latest = Page?.airingSchedules?.[0];
	return latest
		? {
				anilistId,
				episode: latest.episode,
				airingAt: fromUnixSeconds(latest.airingAt),
			}
		: null;
}

/** @throws {@link AnimeNotFoundError} for unknown and adult anime. */
async function fetchAnimeDetails(anilistId: number) {
	const media = (await loadAnimeDetails([anilistId])).get(anilistId);
	if (!media || media.isAdult) {
		throw new AnimeNotFoundError(anilistId);
	}

	return settleStatus(media);
}

/** Japan Standard Time, which AniList's dates are in, is UTC+9. */
const japanOffsetMs = 9 * hour;

/**
 * Marks an anime finished once its final episode has aired.
 *
 * AniList's editors mark an anime finished by hand, often hours or a day
 * after its finale airs. An anime AniList still calls airing, with nothing
 * announced after an aired episode numbered at least its episode count, is
 * finished already; its end date, when AniList has none yet, is the day in
 * Japan that episode aired.
 *
 * @throws {@link UpstreamUnavailableError} when AniList cannot be reached.
 */
async function settleStatus(media: AnimeDetailsFragment): Promise<AnimeDetailsFragment> {
	if (media.status !== "RELEASING" || !media.episodes || media.nextAiringEpisode) {
		return media;
	}

	const latest = await fetchLatestAiring(media.id);
	if (!latest || latest.episode < media.episodes) {
		return media;
	}

	const aired = new Date(Date.parse(latest.airingAt) + japanOffsetMs);
	return {
		...media,
		status: "FINISHED",
		endDate: media.endDate?.year
			? media.endDate
			: {
					year: aired.getUTCFullYear(),
					month: aired.getUTCMonth() + 1,
					day: aired.getUTCDate(),
				},
	};
}

function storedAnimeValues(media: AnimeDetailsFragment) {
	return {
		anilistId: media.id,
		media,
		status: media.status,
		refreshedAt: new Date(),
	};
}
