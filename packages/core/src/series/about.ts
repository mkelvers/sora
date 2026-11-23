import type { Anime } from "../catalog/models/anime";
import type { AgeRating } from "../database/schema/playback";
import type { TitleAward } from "../database/schema/series";
import type { ContentLanguage } from "../models/series";
import { LanguageTag } from "../playback/streams/subtitle-languages";

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

/** A title's about section, worded for display, from what is stored of it. */
export class About {
	/** The original language of anime from each country AniList files anime under. */
	static readonly #originalLanguages = new Map<string, string>(
		Object.entries({
			CN: "zh",
			JP: "ja",
			KR: "ko",
			TW: "zh",
		}),
	);

	/** The most awards a title lists; the more notable are kept. */
	static readonly #shownAwards = 6;

	/**
	 * Awards known well beyond their field, the most renowned first, as IMDb
	 * names them: film's and television's, then animation's, then anime's.
	 * Others rank by how many stored titles they were given to.
	 */
	static readonly #renowned = [
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

	/** Where an award without a year sorts: after every year. */
	static readonly #undated = Number.POSITIVE_INFINITY;

	/** Ages each US certification TMDB lists is for, when MyAnimeList's rating is missing. */
	static readonly #certificationAges = new Map<string, string>(
		Object.entries({
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
		}),
	);

	/** AniList tags that warn of something, and the warnings. */
	static readonly #advisoryTags = new Map<string, string[]>(
		Object.entries({
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
		}),
	);

	/** AniList genres that warn of something, and the warnings. */
	static readonly #advisoryGenres = new Map<string, string[]>(
		Object.entries({
			Ecchi: ["Sexual content"],
			Horror: ["Fear"],
		}),
	);

	/** TMDB keywords that warn of something, lowercased, and the warnings. */
	static readonly #advisoryKeywords = new Map<string, string[]>(
		Object.entries({
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
		}),
	);

	/**
	 * What ratings' descriptors on TMDB warn of, lowercased; a descriptor may
	 * name two, as in `Violence / Horror`.
	 */
	static readonly #advisoryDescriptors = new Map<string, string[]>(
		Object.entries({
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
		}),
	);

	/**
	 * Publishers of manga, light novels, and games that sit on the production
	 * committees of what they publish, as AniList names them.
	 */
	static readonly #publishers = new Set([
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

	readonly #sources: AboutSources;

	constructor(sources: AboutSources) {
		this.#sources = sources;
	}

	/** The section; see `DetailSchema`. */
	get section() {
		return {
			audio_languages: this.#audioLanguages,
			awards: this.#awardLines,
			content_rating: this.#contentRating,
			credit: this.#creditLine,
			current_award: this.#currentAward,
			subtitle_languages: this.#subtitleLanguages,
			synopsis: this.#synopsis,
		};
	}

	/** Where an award sorts among the renowned awards; after them when it is not one. */
	static #renown(award: TitleAward) {
		const index = About.#renowned.indexOf(award.name);

		if (index === -1) {
			return About.#renowned.length;
		}

		return index;
	}

	/** An award as a line, such as `2026 Crunchyroll Anime Awards Winner`. */
	static #line(award: TitleAward) {
		let year = "";

		if (award.year) {
			year = `${award.year} `;
		}

		let outcome = "Nominee";

		if (award.won) {
			outcome = "Winner";
		}

		return `${year}${award.name} ${outcome}`;
	}

	/**
	 * The languages its audio is in: the original's, for a sub or raw, then
	 * English, for a dub, which providers only carry in English.
	 */
	get #audioLanguages() {
		const { anime, audio } = this.#sources;
		const original = About.#originalLanguages.get(anime.countryOfOrigin ?? "JP") ?? "ja";
		const tags: string[] = [];

		if (audio.includes("sub") || audio.includes("raw")) {
			tags.push(original);
		}

		if (audio.includes("dub")) {
			tags.push("en");
		}

		return [...new Set(tags.flatMap((tag) => new LanguageTag(tag).name ?? []))];
	}

	/** English first, then the rest by name; tags that name no language are left out. */
	get #subtitleLanguages() {
		const named = this.#sources.subtitles.flatMap((tag) => {
			const { name } = new LanguageTag(tag);

			if (name) {
				return [
					{
						english: tag === "en" || tag.startsWith("en-"),
						name,
					},
				];
			}

			return [];
		});

		const sorted = named.toSorted(
			(left, right) =>
				Number(right.english) - Number(left.english) || left.name.localeCompare(right.name),
		);

		return [...new Set(sorted.map((language) => language.name))];
	}

	/**
	 * Whether an award was given for this title rather than another season of
	 * its show. IMDb files awards per show, and a year's awards honour what
	 * aired before them, so each year's go to the latest season that started
	 * in an earlier year; those of the year the show started, and those without
	 * a year, go to its first. A title that is all of its TMDB title gets every
	 * award.
	 */
	#givenFor(award: TitleAward) {
		const sources = this.#sources;
		const start = Number(sources.anime.startDate?.slice(0, 4)) || null;

		if (!start || sources.seasonStarts.length === 0) {
			return true;
		}

		const starts = [...sources.seasonStarts, start];
		const before = starts.filter((year) => award.year !== null && year < award.year);
		let latest = Math.min(...starts);

		if (before.length > 0) {
			latest = Math.max(...before);
		}

		return latest === start;
	}

	/**
	 * Orders awards the most notable first: a renowned award before others,
	 * wins before nominations, the more renowned before the less, then those
	 * given to more stored titles, which puts anime's own awards ahead of a
	 * film critics' circle that once named an anime film, then the latest.
	 */
	#byNotability(left: TitleAward, right: TitleAward) {
		const reach = this.#sources.awardReach;

		return (
			Number(About.#renowned.includes(right.name)) - Number(About.#renowned.includes(left.name)) ||
			Number(right.won) - Number(left.won) ||
			About.#renown(left) - About.#renown(right) ||
			(reach.get(right.name) ?? 0) - (reach.get(left.name) ?? 0) ||
			(right.year ?? 0) - (left.year ?? 0)
		);
	}

	/**
	 * The most notable awards given for the title as lines, at most
	 * {@link About.#shownAwards}, oldest first, as Crunchyroll lists them: a
	 * year's nominations before its wins. Those without a year come last.
	 */
	get #awardLines() {
		return this.#sources.awards
			.filter((award) => this.#givenFor(award))
			.toSorted((left, right) => this.#byNotability(left, right))
			.slice(0, About.#shownAwards)
			.toSorted(
				(left, right) =>
					(left.year ?? About.#undated) - (right.year ?? About.#undated) ||
					left.name.localeCompare(right.name) ||
					Number(left.won) - Number(right.won),
			)
			.map((award) => About.#line(award));
	}

	/**
	 * The most notable award given for the title this year as a line; `null`
	 * when this year has none.
	 */
	get #currentAward() {
		const year = new Date().getUTCFullYear();

		const [current] = this.#sources.awards
			.filter((award) => award.year === year && this.#givenFor(award))
			.toSorted((left, right) => this.#byNotability(left, right));

		if (current) {
			return About.#line(current);
		}

		return null;
	}

	/**
	 * The age a title is for and what it warns of: MyAnimeList's rating, else
	 * TMDB's US certification, and the warnings the rating stands for, plus
	 * those of any country's rating on TMDB, of TMDB's keywords, of the AniList
	 * tags that apply strongly, and of its genres. `null` when nothing is known.
	 */
	get #contentRating() {
		const sources = this.#sources;
		const descriptorParts = /\s*\/\s*/u;

		/** How strongly a tag must apply, 0–100, to warn of it; below, it only comes up. */
		const advisoryRank = 50;

		/** Ages each MyAnimeList rating is for, and what it warns of. */
		const ageRatings: Record<
			AgeRating,
			{
				age: string;
				descriptors: string[];
			}
		> = {
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

		let rated: (typeof ageRatings)[AgeRating] | null = null;

		if (sources.ageRating) {
			rated = ageRatings[sources.ageRating];
		}

		let certified: string | null = null;

		if (sources.certification) {
			certified = About.#certificationAges.get(sources.certification) ?? null;
		}

		const age = rated?.age ?? certified;

		const descriptors = [
			...new Set([
				...(rated?.descriptors ?? []),
				...sources.descriptors.flatMap((descriptor) =>
					descriptor
						.split(descriptorParts)
						.flatMap((part) => About.#advisoryDescriptors.get(part.trim().toLowerCase()) ?? []),
				),
				...sources.keywords.flatMap(
					(keyword) => About.#advisoryKeywords.get(keyword.trim().toLowerCase()) ?? [],
				),
				...sources.anime.tags.flatMap((tag) => {
					if (!tag.spoiler && (tag.rank ?? 0) >= advisoryRank) {
						return About.#advisoryTags.get(tag.name) ?? [];
					}

					return [];
				}),
				...sources.anime.genres.flatMap((genre) => About.#advisoryGenres.get(genre) ?? []),
			]),
		].toSorted((left, right) => left.localeCompare(right));

		if (age || descriptors.length > 0) {
			return {
				age,
				descriptors,
			};
		}

		return null;
	}

	/**
	 * A copyright line in the pattern anime carry, such as `© Mizuho Kusanagi,
	 * Hakusensha/“Yona of the Dawn” Production Committee`: who created the
	 * original work, its publisher when it sits on the production committee
	 * (see the publishers listed), then the committee, which is named after the
	 * title. An anime not from Japan has no committee and names its studios
	 * instead, and one adapting nothing names its studios as the creator.
	 *
	 * Assembled from AniList's credits: no provider carries the rights holders'
	 * own notice, so the committee's name is the usual one, not a quoted one.
	 */
	get #creditLine() {
		const { anime } = this.#sources;
		/** Roles AniList credits a title's creator with. */
		const creatorRole = /^Original (?:Creator|Story)\b/u;

		const creators = [
			...new Set(
				anime.staff.filter((credit) => creatorRole.test(credit.role)).map((credit) => credit.name),
			),
		];

		const publisher = anime.producers.find((producer) => About.#publishers.has(producer));
		const studios = anime.studios.join(", ");

		let credited = anime.studios;

		if (creators.length > 0) {
			credited = creators;
		}

		const owners = [...credited];

		if (publisher) {
			owners.push(publisher);
		}

		const japanese = (anime.countryOfOrigin ?? "JP") === "JP";
		let maker = studios;

		if (japanese) {
			maker = `“${anime.title.display}” Production Committee`;
		}

		const parties = [owners.join(", ")];

		if (maker !== owners.join(", ")) {
			parties.push(maker);
		}

		const named = parties.filter(Boolean);

		if (named.length > 0) {
			return `© ${named.join("/")}`;
		}

		return null;
	}

	/**
	 * The synopsis that says more: AniList's, cut to one paragraph of about 90
	 * words, or the stored one, which stands in for AniList's when that only
	 * names the release.
	 */
	get #synopsis() {
		const { overview } = this.#sources;
		const { blurb } = this.#sources.anime;

		if (!blurb) {
			return overview;
		}

		if (overview && overview.length > blurb.length) {
			return overview;
		}

		return blurb;
	}
}
