import { filterGroups } from "$routes/(app)/(catalog)/catalog.svelte";
import type { CatalogFilters } from "$routes/(app)/(catalog)/catalog.svelte";
import type { Tag } from "@sora/sdk";

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

export const sources = sourceValues.map((value) => {
	const labels: Record<Source, string> = {
		LIGHT_NOVEL: "Light novel",
		MANGA: "Manga",
		NOVEL: "Novel",
		ORIGINAL: "Original",
		VIDEO_GAME: "Video game",
		VISUAL_NOVEL: "Visual novel",
		WEB_NOVEL: "Web novel",
	};

	return {
		label: labels[value],
		value,
	};
});

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

const unfiltered: BrowseFilters = {
	audio: undefined,
	country: undefined,
	format: undefined,
	genres: [],
	hideMature: false,
	sort: "popular",
	sources: [],
	studios: [],
	tags: [],
};

export const browse = $state<BrowseFilters>(structuredClone(unfiltered));

export const filterBy = (preset: Partial<BrowseFilters>) => {
	Object.assign(browse, structuredClone(unfiltered), preset);
};

export const toggle = <T>(list: T[], value: T) => {
	if (list.includes(value)) {
		return list.filter((item) => item !== value);
	}

	return [...list, value];
};

export const pageTitle = (filters: BrowseFilters) => {
	const named = [...filters.genres, ...filters.tags, ...filters.studios];

	if (named.length === 1) {
		return `${named[0]} Anime`;
	}

	return "Browse Anime";
};

export const catalogRequest = (filters: BrowseFilters) => {
	const chosen: Country[] = [];

	if (filters.country) {
		chosen.push(filters.country);
	}

	return {
		audio: filters.audio,
		countries: chosen,
		format: filters.format,
		genres: filters.genres,
		hideMature: filters.hideMature,
		kind: "browse" as const,
		sort: filters.sort,
		sources: filters.sources,
		studios: filters.studios,
		tags: filters.tags,
	};
};

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

export const groupsOf = ({
	filters,
	genres,
	tags,
}: {
	filters: BrowseFilters;
	genres: string[];
	tags: Tag[];
}) => {
	const many = (
		id: "genres" | "tags" | "sources",
		label: string,
		options: {
			label: string;
			value: string;
		}[],
	): Group => {
		const selected: string[] = filters[id];

		return {
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
		};
	};

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
		genres: many(
			"genres",
			"Genres",
			genres.map((name) => ({
				label: name,
				value: name,
			})),
		),
		options,
		source: many("sources", "Source", sources),
		tags: many(
			"tags",
			"Tags",
			tags
				.map((tag) => tag.name)
				.toSorted((left, right) => left.localeCompare(right))
				.map((name) => ({
					label: name,
					value: name,
				})),
		),
	};
};
