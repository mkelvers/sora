import type { Anime } from "../catalog/models/anime";
import type { AgeRating } from "../database/schema/playback";
import type { TitleAward } from "../database/schema/series";
import type { ContentLanguage } from "../models/series";
import { languageName } from "../playback/streams/subtitle-languages";

/** What a title's about section is made of, as stored. */
export interface AboutSources {
	anime: Anime;
	/** The audio its episodes can be watched with. */
	audio: readonly ContentLanguage[];
	/** BCP 47 tags of the subtitles its streams were seen with; see `seriesSubtitles`. */
	subtitles: readonly string[];
	/** MyAnimeList's rating of the AniKoto series it streams from. */
	ageRating: AgeRating | null;
	/** TMDB's US certification of its TMDB title. */
	certification: string | null;
	/** What any country's rating of its TMDB title warns of; see `titleFacts.descriptors`. */
	descriptors: readonly string[];
	/** TMDB's keywords for its TMDB title. */
	keywords: readonly string[];
	awards: readonly TitleAward[];
}

/** The original language of anime from each country AniList files anime under. */
const originalLanguages: Record<string, string> = {
	CN: "zh",
	JP: "ja",
	KR: "ko",
	TW: "zh",
};

/**
 * The languages its audio is in: the original's, for a sub or raw, then
 * English, for a dub, which providers only carry in English.
 */
const audioLanguages = (anime: Anime, audio: readonly ContentLanguage[]) => {
	const original = originalLanguages[anime.countryOfOrigin ?? "JP"] ?? "ja";
	const tags = [
		...(audio.includes("sub") || audio.includes("raw") ? [original] : []),
		...(audio.includes("dub") ? ["en"] : []),
	];
	return [...new Set(tags.flatMap((tag) => languageName(tag) ?? []))];
};

/** English first, then the rest by name; tags that name no language are left out. */
const subtitleLanguages = (tags: readonly string[]) => {
	const named = tags.flatMap((tag) => {
		const name = languageName(tag);
		return name
			? [
					{
						english: tag === "en" || tag.startsWith("en-"),
						name,
					},
				]
			: [];
	});
	const sorted = named.toSorted(
		(left, right) =>
			Number(right.english) - Number(left.english) || left.name.localeCompare(right.name),
	);
	return [...new Set(sorted.map((language) => language.name))];
};

/** An ordinal before an award's name, as in `7th Crunchyroll Anime Awards`. */
const ordinal = /^\d+(?:st|nd|rd|th)\s+/u;
const namesYear = /\b\d{4}\b/u;

/** How many years after a title ends its awards may still be given, as film awards often are. */
const awardYearsAfter = 2;

/**
 * Whether an award was given for this title rather than another season of
 * its show: Wikidata files awards per show, so only those given from the
 * year it started to {@link awardYearsAfter} after it ended count. An award
 * without a year always does.
 */
const givenFor = (anime: Anime) => {
	const start = Number(anime.startDate?.slice(0, 4));
	if (!start) {
		return () => true;
	}
	const ended = Number(anime.endDate?.slice(0, 4));
	const end = anime.status === "FINISHED" && ended ? ended : new Date().getUTCFullYear();
	return (award: TitleAward) =>
		award.year === null || (award.year >= start && award.year <= end + awardYearsAfter);
};

/**
 * Each award given for the title (see {@link givenFor}) as a line, such as
 * `2014 Tokyo Anime Award Winner`, the latest first. The ordinal of a yearly
 * award gives way to its year, and a nomination for an award it won that
 * year is left out.
 */
const awardLines = (anime: Anime, awards: readonly TitleAward[]) => {
	const given = awards.filter(givenFor(anime));
	const won = new Set(
		given.filter((award) => award.won).map((award) => `${award.name}:${award.year}`),
	);
	return [
		...new Set(
			given
				.filter((award) => award.won || !won.has(`${award.name}:${award.year}`))
				.toSorted(
					(left, right) =>
						(right.year ?? 0) - (left.year ?? 0) ||
						Number(right.won) - Number(left.won) ||
						left.name.localeCompare(right.name),
				)
				.map((award) => {
					const name = award.year ? award.name.replace(ordinal, "") : award.name;
					const year = award.year && !namesYear.test(name) ? `${award.year} ` : "";
					return `${year}${name} ${award.won ? "Winner" : "Nominee"}`;
				}),
		),
	];
};

/** Ages each MyAnimeList rating is for, and what it warns of. */
const ageRatings: Record<AgeRating, { age: string; descriptors: string[] }> = {
	G: {
		age: "All ages",
		descriptors: [],
	},
	PG: {
		age: "7+",
		descriptors: [],
	},
	"PG-13": {
		age: "13+",
		descriptors: [],
	},
	R: {
		age: "17+",
		descriptors: ["Profanity", "Violence"],
	},
	"R+": {
		age: "17+",
		descriptors: ["Nudity"],
	},
	Rx: {
		age: "18+",
		descriptors: ["Sexual content"],
	},
};

/** Ages each US certification TMDB lists is for, when MyAnimeList's rating is missing. */
const certificationAges: Record<string, string> = {
	G: "All ages",
	"NC-17": "18+",
	PG: "10+",
	"PG-13": "13+",
	R: "17+",
	"TV-14": "14+",
	"TV-G": "All ages",
	"TV-MA": "17+",
	"TV-PG": "10+",
	"TV-Y": "All ages",
	"TV-Y7": "7+",
};

/** AniList tags that warn of something, and the warnings. */
const advisoryTags: Record<string, string[]> = {
	Assassins: ["Violence"],
	"Battle Royale": ["Violence"],
	"Body Horror": ["Gore"],
	Cannibalism: ["Gore"],
	"Cosmic Horror": ["Fear"],
	"Death Game": ["Violence"],
	Drugs: ["Drug use"],
	Gambling: ["Gambling"],
	Gore: ["Gore", "Violence"],
	Guns: ["Violence"],
	"Martial Arts": ["Violence"],
	Nudity: ["Nudity"],
	Rape: ["Sexual violence"],
	Suicide: ["Suicide"],
	Swordplay: ["Violence"],
	Terrorism: ["Violence"],
	Torture: ["Torture", "Violence"],
	War: ["Violence"],
};

/** How strongly a tag must apply, 0–100, to warn of it; below, it only comes up. */
const advisoryRank = 50;

/** AniList genres that warn of something, and the warnings. */
const advisoryGenres: Record<string, string[]> = {
	Ecchi: ["Sexual content"],
	Horror: ["Fear"],
};

/** TMDB keywords that warn of something, lowercased, and the warnings. */
const advisoryKeywords: Record<string, string[]> = {
	alcohol: ["Alcohol"],
	alcoholism: ["Alcohol"],
	assassin: ["Violence"],
	assassination: ["Violence"],
	battle: ["Violence"],
	blood: ["Gore"],
	bloodshed: ["Gore", "Violence"],
	"body horror": ["Gore"],
	brutality: ["Violence"],
	cannibalism: ["Gore"],
	cigarette: ["Smoking"],
	combat: ["Violence"],
	cursing: ["Profanity"],
	decapitation: ["Gore"],
	dismemberment: ["Gore"],
	drinking: ["Alcohol"],
	"drug abuse": ["Drug use"],
	"drug addiction": ["Drug use"],
	"drug dealer": ["Drug use"],
	"drug use": ["Drug use"],
	drugs: ["Drug use"],
	drunk: ["Alcohol"],
	drunkenness: ["Alcohol"],
	ecchi: ["Sexual content"],
	erotic: ["Sexual content"],
	"fan service": ["Sexual content"],
	fanservice: ["Sexual content"],
	fight: ["Violence"],
	fighting: ["Violence"],
	"foul language": ["Profanity"],
	gambling: ["Gambling"],
	gore: ["Gore", "Violence"],
	gunfight: ["Violence"],
	horror: ["Fear"],
	killing: ["Violence"],
	"martial arts": ["Violence"],
	massacre: ["Violence"],
	murder: ["Violence"],
	mutilation: ["Gore"],
	naked: ["Nudity"],
	nudity: ["Nudity"],
	profanity: ["Profanity"],
	rape: ["Sexual violence"],
	"self harm": ["Self-harm"],
	"serial killer": ["Violence"],
	sex: ["Sexual content"],
	"sexual abuse": ["Sexual violence"],
	"sexual assault": ["Sexual violence"],
	"sexual content": ["Sexual content"],
	"sexual violence": ["Sexual violence"],
	shootout: ["Violence"],
	slaughter: ["Violence"],
	smoking: ["Smoking"],
	splatter: ["Gore"],
	suicide: ["Suicide"],
	"suicide attempt": ["Suicide"],
	swearing: ["Profanity"],
	"sword fight": ["Violence"],
	swordplay: ["Violence"],
	tobacco: ["Smoking"],
	topless: ["Nudity"],
	torture: ["Torture", "Violence"],
	violence: ["Violence"],
	war: ["Violence"],
};

/**
 * What ratings' descriptors on TMDB warn of, lowercased; a descriptor may
 * name two, as in `Violence / Horror`.
 */
const advisoryDescriptors: Record<string, string[]> = {
	"drug use": ["Drug use"],
	drugs: ["Drug use"],
	fear: ["Fear"],
	horror: ["Fear"],
	injury: ["Violence"],
	language: ["Profanity"],
	nudity: ["Nudity"],
	sex: ["Sexual content"],
	sexuality: ["Sexual content"],
	threat: ["Fear"],
	violence: ["Violence"],
};

const descriptorParts = /\s*\/\s*/u;

/**
 * The age a title is for and what it warns of: MyAnimeList's rating, else
 * TMDB's US certification, and the warnings the rating stands for, plus
 * those of any country's rating on TMDB, of TMDB's keywords, of the AniList
 * tags that apply strongly, and of its genres. `null` when nothing is known.
 */
const contentRating = (sources: AboutSources) => {
	const rated = sources.ageRating ? ageRatings[sources.ageRating] : null;
	const age =
		rated?.age ??
		(sources.certification ? (certificationAges[sources.certification] ?? null) : null);
	const descriptors = [
		...new Set([
			...(rated?.descriptors ?? []),
			...sources.descriptors.flatMap((descriptor) =>
				descriptor
					.split(descriptorParts)
					.flatMap((part) => advisoryDescriptors[part.trim().toLowerCase()] ?? []),
			),
			...sources.keywords.flatMap(
				(keyword) => advisoryKeywords[keyword.trim().toLowerCase()] ?? [],
			),
			...sources.anime.tags.flatMap((tag) =>
				!tag.spoiler && (tag.rank ?? 0) >= advisoryRank ? (advisoryTags[tag.name] ?? []) : [],
			),
			...sources.anime.genres.flatMap((genre) => advisoryGenres[genre] ?? []),
		]),
	].toSorted((left, right) => left.localeCompare(right));

	return age || descriptors.length > 0
		? {
				age,
				descriptors,
			}
		: null;
};

/** Roles AniList credits a title's creator with. */
const creatorRole = /^Original (?:Creator|Story)\b/u;

/**
 * A credit line in the style of a copyright notice, such as `© Mizuho
 * Kusanagi/Studio Pierrot`: who created the original work, as AniList
 * credits them, then the studios that made the anime. Assembled from
 * credits, not the rights holders' own notice, which no provider carries.
 */
const creditLine = (anime: Anime) => {
	const creators = [
		...new Set(
			anime.staff.filter((credit) => creatorRole.test(credit.role)).map((credit) => credit.name),
		),
	];
	const parties = [creators, anime.studios].flatMap((names) =>
		names.length > 0 ? [names.join(", ")] : [],
	);
	return parties.length > 0 ? `© ${parties.join("/")}` : null;
};

/** A title's about section, worded for display; see `SeriesSchema`. */
export const aboutSeries = (sources: AboutSources) => ({
	audio_languages: audioLanguages(sources.anime, sources.audio),
	awards: awardLines(sources.anime, sources.awards),
	content_rating: contentRating(sources),
	credit: creditLine(sources.anime),
	subtitle_languages: subtitleLanguages(sources.subtitles),
});
