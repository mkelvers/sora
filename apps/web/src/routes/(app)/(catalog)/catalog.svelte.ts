export type CatalogFilters = {
	audio?: "sub" | "dub";
	format?: "TV" | "MOVIE";
};

export const filterGroups = [
	{
		id: "audio",
		label: "Language",
		options: [
			{
				label: "All",
				value: undefined,
			},
			{
				label: "Subtitled",
				value: "sub",
			},
			{
				label: "Dubbed",
				value: "dub",
			},
		],
	},
	{
		id: "format",
		label: "Media",
		options: [
			{
				label: "All",
				value: undefined,
			},
			{
				label: "Series",
				value: "TV",
			},
			{
				label: "Movies",
				value: "MOVIE",
			},
		],
	},
] as const;

export const filters = $state<CatalogFilters>({});
