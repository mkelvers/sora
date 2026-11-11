import { filterGroups, filterLabels } from "$routes/(app)/(catalog)/catalog.svelte";
import type { CatalogFilters } from "$routes/(app)/(catalog)/catalog.svelte";
import type { Tag } from "@sora/sdk";

export const slug = (name: string) => name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-");

export const sorts = [
	{
		label: "Popularity",
		value: "popular",
	},
	{
		label: "Trending",
		value: "trending",
	},
	{
		label: "Newest",
		value: "newest",
	},
	{
		label: "Highest rated",
		value: "score",
	},
	{
		label: "Alphabetical",
		value: "title",
	},
] as const;

export const sourceValues = [
	"ORIGINAL",
	"MANGA",
	"LIGHT_NOVEL",
	"WEB_NOVEL",
	"NOVEL",
	"VISUAL_NOVEL",
	"VIDEO_GAME",
] as const;

type Source = (typeof sourceValues)[number];

const sourceLabels: Record<Source, string> = {
	LIGHT_NOVEL: "Light novel",
	MANGA: "Manga",
	NOVEL: "Novel",
	ORIGINAL: "Original",
	VIDEO_GAME: "Video game",
	VISUAL_NOVEL: "Visual novel",
	WEB_NOVEL: "Web novel",
};

export const sources = sourceValues.map((value) => ({
	label: sourceLabels[value],
	value,
}));

export const countries = [
	{
		label: "Japan",
		value: "JP",
	},
	{
		label: "China",
		value: "CN",
	},
	{
		label: "South Korea",
		value: "KR",
	},
	{
		label: "Taiwan",
		value: "TW",
	},
] as const;

export const lengths = [
	{
		label: "Up to 13 episodes",
		max: 13,
		min: undefined,
		value: "short",
	},
	{
		label: "14 to 26 episodes",
		max: 26,
		min: 14,
		value: "medium",
	},
	{
		label: "27+ episodes",
		max: undefined,
		min: 27,
		value: "long",
	},
] as const;

type Sort = (typeof sorts)[number]["value"];
type Country = (typeof countries)[number]["value"];
type Length = (typeof lengths)[number]["value"];

export interface BrowseFilters extends CatalogFilters {
	genres: string[];
	tags: string[];
	studios: string[];
	sort: Sort;
	sources: Source[];
	country?: Country;
	decade?: number;
	length?: Length;
	hideMature: boolean;
}

export const noFilters: BrowseFilters = {
	genres: [],
	hideMature: false,
	sort: "popular",
	sources: [],
	studios: [],
	tags: [],
};

const pick = <T extends string>(
	options: readonly { value: T | undefined }[],
	value: string | null,
) => options.find((option) => option.value?.toLowerCase() === value?.toLowerCase())?.value;

const [languages, media] = filterGroups;

export const parseFilters = (
	params: Pick<URLSearchParams, "get" | "getAll">,
	genres: string[],
	tags: Tag[],
): BrowseFilters => {
	const named = (key: string, names: string[]) =>
		params.getAll(key).flatMap((value) => names.find((name) => slug(name) === value) ?? []);
	const decade = Number(params.get("decade"));

	return {
		audio: pick(languages.options, params.get("audio")),
		country: pick(countries, params.get("country")),
		decade: Number.isInteger(decade) && decade >= 1940 && decade % 10 === 0 ? decade : undefined,
		format: pick(media.options, params.get("format")),
		genres: named("genre", genres),
		hideMature: params.get("mature") === "hide",
		length: pick(lengths, params.get("length")),
		sort: pick(sorts, params.get("sort")) ?? "popular",
		sources: params
			.getAll("source")
			.flatMap((value) => pick(sources, value.replaceAll("-", "_")) ?? []),
		studios: params.getAll("studio").filter((studio) => studio.length > 0),
		tags: named(
			"tag",
			tags.map((tag) => tag.name),
		),
	};
};

export const browseHref = (filters: Partial<BrowseFilters>) => {
	const params = new URLSearchParams();
	for (const genre of filters.genres ?? []) {
		params.append("genre", slug(genre));
	}
	for (const tag of filters.tags ?? []) {
		params.append("tag", slug(tag));
	}
	for (const studio of filters.studios ?? []) {
		params.append("studio", studio);
	}
	for (const source of filters.sources ?? []) {
		params.append("source", slug(source));
	}
	const single = {
		audio: filters.audio,
		country: filters.country?.toLowerCase(),
		decade: filters.decade?.toString(),
		format: filters.format?.toLowerCase(),
		length: filters.length,
		mature: filters.hideMature ? "hide" : undefined,
		sort: filters.sort === "popular" ? undefined : filters.sort,
	};
	for (const [key, value] of Object.entries(single)) {
		if (value) {
			params.set(key, value);
		}
	}

	const search = params.toString();
	return search ? `/browse?${search}` : "/browse";
};

export const toggle = <T>(list: T[], value: T) =>
	list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

export const browseTitle = (filters: BrowseFilters) => {
	const named = [...filters.genres, ...filters.tags, ...filters.studios];
	return named.length === 1 ? `${named[0]} Anime` : "Browse Anime";
};

export const browseLabels = (filters: BrowseFilters) => [
	...filters.genres,
	...filters.tags,
	...filters.studios,
	...filterLabels(filters),
	...(filters.decade ? [`${filters.decade}s`] : []),
	...lengths.filter((length) => length.value === filters.length).map((length) => length.label),
	...sources
		.filter((source) => filters.sources.includes(source.value))
		.map((source) => source.label),
	...countries
		.filter((country) => country.value === filters.country)
		.map((country) => country.label),
	...(filters.hideMature ? ["No mature content"] : []),
];

export const catalogRequest = (filters: BrowseFilters) => {
	const length = lengths.find((option) => option.value === filters.length);
	return {
		audio: filters.audio,
		countries: filters.country ? [filters.country] : [],
		format: filters.format,
		genres: filters.genres,
		hideMature: filters.hideMature,
		kind: "browse" as const,
		maxEpisodes: length?.max,
		minEpisodes: length?.min,
		sort: filters.sort,
		sources: filters.sources,
		studios: filters.studios,
		tags: filters.tags,
		yearFrom: filters.decade,
		yearTo: filters.decade === undefined ? undefined : filters.decade + 9,
	};
};
