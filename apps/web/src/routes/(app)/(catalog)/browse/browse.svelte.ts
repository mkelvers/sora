import { filterGroups } from "$routes/(app)/(catalog)/catalog.svelte";
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

type Sort = (typeof sorts)[number]["value"];
type Country = (typeof countries)[number]["value"];

export interface BrowseFilters extends CatalogFilters {
	genres: string[];
	tags: string[];
	studios: string[];
	sort: Sort;
	sources: Source[];
	country?: Country;
	hideMature: boolean;
}

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

	return {
		audio: pick(languages.options, params.get("audio")),
		country: pick(countries, params.get("country")),
		format: pick(media.options, params.get("format")),
		genres: named("genre", genres),
		hideMature: params.get("mature") === "hide",
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
		format: filters.format?.toLowerCase(),
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

export const catalogRequest = (filters: BrowseFilters) => ({
	audio: filters.audio,
	countries: filters.country ? [filters.country] : [],
	format: filters.format,
	genres: filters.genres,
	hideMature: filters.hideMature,
	kind: "browse" as const,
	sort: filters.sort,
	sources: filters.sources,
	studios: filters.studios,
	tags: filters.tags,
});

export interface Choice {
	label: string;
	checked: boolean;
	all: boolean;
	next: Partial<BrowseFilters>;
}

export interface Group {
	id: string;
	label: string;
	multiple: boolean;
	choices: Choice[];
}

const many = (
	id: "genres" | "tags" | "sources",
	label: string,
	options: { label: string; value: string }[],
	selected: string[],
): Group => ({
	choices: options.map((option) => ({
		all: false,
		checked: selected.includes(option.value),
		label: option.label,
		next: {
			[id]: toggle(selected, option.value),
		},
	})),
	id,
	label,
	multiple: true,
});

const named = (names: string[]) =>
	names.map((name) => ({
		label: name,
		value: name,
	}));

export const groupsOf = ({
	filters,
	genres,
	tags,
}: {
	filters: BrowseFilters;
	genres: string[];
	tags: Tag[];
}) => {
	const options: Group[] = filterGroups.map((group) => ({
		choices: group.options.map((option) => ({
			all: option.value === undefined,
			checked: filters[group.id] === option.value,
			label: option.label,
			next: {
				[group.id]: option.value,
			},
		})),
		id: group.id,
		label: group.label,
		multiple: false,
	}));

	return {
		country: {
			choices: [undefined, ...countries].map((country) => ({
				all: country === undefined,
				checked: filters.country === country?.value,
				label: country?.label ?? "All",
				next: {
					country: country?.value,
				},
			})),
			id: "country",
			label: "Country",
			multiple: false,
		} satisfies Group,
		genres: many("genres", "Genres", named(genres), filters.genres),
		options,
		source: many("sources", "Source", sources, filters.sources),
		tags: many(
			"tags",
			"Tags",
			named(tags.map((tag) => tag.name).toSorted((left, right) => left.localeCompare(right))),
			filters.tags,
		),
	};
};
