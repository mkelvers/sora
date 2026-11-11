import type { Anime } from "../catalog/models/anime";
import type { AgeRating } from "../database/schema/playback";
import type { TitleAward } from "../database/schema/series";
import type { ContentLanguage } from "../models/series";
import { languageName } from "../playback/streams/subtitle-languages";

/** What a title's about section is made of, as stored. */
export interface AboutSources {
	anime: Anime;
	/** Its stored synopsis, cut down to its premise; see `series.overview`. */
	overview: string | null;
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
	/** What IMDb says it won or was nominated for; see `titleFacts.awards`. */
	awards: readonly TitleAward[];
	/** How many stored titles each of its awards was given to, by name. */
	awardReach: ReadonlyMap<string, number>;
	/**
	 * The years the other titles laid out from its TMDB title started in,
	 * other than its specials, such as the other seasons of its show.
	 */
	seasonStarts: readonly number[];
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

/** A `YYYY…` date's year, or `null`. */
const yearOf = (date: string | null) => Number(date?.slice(0, 4)) || null;

/**
 * Whether an award was given for this title rather than another season of
 * its show. IMDb files awards per show, and a year's awards honour what
 * aired before them, so each year's go to the latest season that started
 * in an earlier year; those of the year the show started, and those without
 * a year, go to its first. A title that is all of its TMDB title gets every
 * award.
 */
const givenFor = (sources: AboutSources) => {
	const start = yearOf(sources.anime.startDate);
	if (!start || sources.seasonStarts.length === 0) {
		return () => true;
	}
	const starts = [...sources.seasonStarts, start];
	const first = Math.min(...starts);
	return (award: TitleAward) => {
		const before = starts.filter((year) => award.year !== null && year < award.year);
		return (before.length > 0 ? Math.max(...before) : first) === start;
	};
};

/** The most awards a title lists; the more notable are kept. */
const shownAwards = 6;

/**
 * Awards known well beyond their field, the most renowned first, as IMDb
 * names them: film's and television's, then animation's, then anime's.
 * Others rank by how many stored titles they were given to.
 */
const renownedAwards = [
	"Academy Awards",
	"Golden Globes",
	"BAFTA Awards",
	"Primetime Emmy Awards",
	"International Emmy Awards",
	"Cannes Film Festival",
	"Venice Film Festival",
	"Berlin International Film Festival",
	"Annie Awards",
	"Annecy International Animated Film Festival",
	"Awards of the Japanese Academy",
	"Crunchyroll Anime Awards",
	"Tokyo Anime Award",
	"Mainichi Film Concours",
	"Japan Media Arts Festival",
	"Kinema Junpo Awards",
	"Blue Ribbon Awards",
	"Ottawa International Animation Festival",
	"Hiroshima International Animation Festival",
];

/** Where an award sorts among {@link renownedAwards}; after them when it is not one. */
const renown = (award: TitleAward) => {
	const index = renownedAwards.indexOf(award.name);
	return index === -1 ? renownedAwards.length : index;
};

/** Where an award without a year sorts: after every year. */
const undated = Number.POSITIVE_INFINITY;

/** An award as a line, such as `2026 Crunchyroll Anime Awards Winner`. */
const awardLine = (award: TitleAward) =>
	`${award.year ? `${award.year} ` : ""}${award.name} ${award.won ? "Winner" : "Nominee"}`;

/**
 * Orders awards the most notable first: a renowned award (see
 * {@link renownedAwards}) before others, wins before nominations, the more
 * renowned before the less, then those given to more stored titles, which
 * puts anime's own awards ahead of a film critics' circle that once named an
 * anime film, then the latest.
 */
const byNotability =
	(reach: ReadonlyMap<string, number>) => (left: TitleAward, right: TitleAward) =>
		Number(renownedAwards.includes(right.name)) - Number(renownedAwards.includes(left.name)) ||
		Number(right.won) - Number(left.won) ||
		renown(left) - renown(right) ||
		(reach.get(right.name) ?? 0) - (reach.get(left.name) ?? 0) ||
		(right.year ?? 0) - (left.year ?? 0);

/**
 * The {@link shownAwards} most notable awards given for the title (see
 * {@link givenFor}) as lines, oldest first, as Crunchyroll lists them: a
 * year's nominations before its wins. Those without a year come last.
 */
const awardLines = (sources: AboutSources) =>
	sources.awards
		.filter(givenFor(sources))
		.toSorted(byNotability(sources.awardReach))
		.slice(0, shownAwards)
		.toSorted(
			(left, right) =>
				(left.year ?? undated) - (right.year ?? undated) ||
				left.name.localeCompare(right.name) ||
				Number(left.won) - Number(right.won),
		)
		.map(awardLine);

/**
 * The most notable award given for the title this year as a line; `null`
 * when this year has none.
 */
const currentAward = (sources: AboutSources) => {
	const year = new Date().getUTCFullYear();
	const given = givenFor(sources);
	const [current] = sources.awards
		.filter((award) => award.year === year && given(award))
		.toSorted(byNotability(sources.awardReach));
	return current ? awardLine(current) : null;
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
 * Publishers of manga, light novels, and games that sit on the production
 * committees of what they publish, as AniList names them.
 */
const publishers = new Set([
	"Akita Shoten",
	"AlphaPolis",
	"ASCII Media Works",
	"Coamix",
	"Earth Star Entertainment",
	"Enterbrain",
	"Fujimi Shobo",
	"Futabasha",
	"Hakusensha",
	"Hobby Japan",
	"Houbunsha",
	"Ichijinsha",
	"Imagica Infos",
	"Kadokawa",
	"KADOKAWA",
	"Kadokawa Shoten",
	"Kodansha",
	"Mag Garden",
	"Media Factory",
	"Micro Magazine",
	"Overlap",
	"SB Creative",
	"Shinchosha",
	"Shogakukan",
	"Shueisha",
	"Shufu to Seikatsusha",
	"Shufunotomo",
	"Square Enix",
	"Takeshobo",
	"TO Books",
]);

/**
 * A copyright line in the pattern anime carry, such as `© Mizuho Kusanagi,
 * Hakusensha/“Yona of the Dawn” Production Committee`: who created the
 * original work, its publisher when it sits on the production committee
 * (see {@link publishers}), then the committee, which is named after the
 * title. An anime not from Japan has no committee and names its studios
 * instead, and one adapting nothing names its studios as the creator.
 *
 * Assembled from AniList's credits: no provider carries the rights holders'
 * own notice, so the committee's name is the usual one, not a quoted one.
 */
const creditLine = (anime: Anime) => {
	const creators = [
		...new Set(
			anime.staff.filter((credit) => creatorRole.test(credit.role)).map((credit) => credit.name),
		),
	];
	const publisher = anime.producers.find((producer) => publishers.has(producer));
	const studios = anime.studios.join(", ");
	const owners = [
		...(creators.length > 0 ? creators : anime.studios),
		...(publisher ? [publisher] : []),
	];
	const japanese = (anime.countryOfOrigin ?? "JP") === "JP";
	const maker = japanese ? `“${anime.title.display}” Production Committee` : studios;
	const parties = [owners.join(", "), ...(maker === owners.join(", ") ? [] : [maker])].filter(
		Boolean,
	);
	return parties.length > 0 ? `© ${parties.join("/")}` : null;
};

/**
 * The fullest synopsis known: AniList's whole one, else the stored one,
 * which stands in for AniList's when that only names the release.
 */
const fullSynopsis = (sources: AboutSources) => {
	const { overview } = sources;
	const { story } = sources.anime;
	if (!story) {
		return overview;
	}

	return overview && overview.length > story.length ? overview : story;
};

/** A title's about section, worded for display; see `SeriesSchema`. */
export const aboutSeries = (sources: AboutSources) => ({
	audio_languages: audioLanguages(sources.anime, sources.audio),
	awards: awardLines(sources),
	content_rating: contentRating(sources),
	credit: creditLine(sources.anime),
	current_award: currentAward(sources),
	subtitle_languages: subtitleLanguages(sources.subtitles),
	synopsis: fullSynopsis(sources),
});
