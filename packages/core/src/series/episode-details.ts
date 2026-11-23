import type { SeriesEpisode } from "./series";

type Details = Pick<
	SeriesEpisode,
	"airDate" | "overview" | "runtimeMinutes" | "stillUrl" | "title"
>;

/**
 * Applies available metadata for the same episode. An undefined still means
 * no image was supplied. A null still means an image was explicitly rejected.
 * With no fallback, missing fields are omitted from the database update.
 */
export const episodeDetails = (
	incoming: Omit<Details, "stillUrl"> & { stillUrl: string | null | undefined },
	fallback?: Details,
) => {
	const placeholderTitle = /^episode [0-9]+$/iu;
	const { stillUrl = fallback?.stillUrl, title: incomingTitle } = incoming;
	let title = fallback?.title;

	if (incomingTitle !== null && !placeholderTitle.test(incomingTitle)) {
		title = incomingTitle;
	}

	return {
		airDate: incoming.airDate ?? fallback?.airDate,
		overview: incoming.overview ?? fallback?.overview,
		runtimeMinutes: incoming.runtimeMinutes ?? fallback?.runtimeMinutes,
		stillUrl,
		title,
	};
};
