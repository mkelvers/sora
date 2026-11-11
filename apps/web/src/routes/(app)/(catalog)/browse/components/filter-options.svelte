<script lang="ts">
	import {
		countries,
		lengths,
		sources,
		toggle,
	} from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { BrowseFilters } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import { getDecades } from "$routes/(app)/(catalog)/catalog.remote";
	import { filterGroups } from "$routes/(app)/(catalog)/catalog.svelte";
	import FilterOption from "$routes/(app)/(catalog)/components/filter-option.svelte";

	let {
		filters,
		scope,
		onchange,
	}: {
		filters: BrowseFilters;
		scope: string;
		onchange: (next: BrowseFilters) => void;
	} = $props();

	interface Choice {
		label: string;
		checked: boolean;
		next: Partial<BrowseFilters>;
	}

	interface Group {
		id: string;
		label: string;
		type: "radio" | "checkbox";
		choices: Choice[];
	}

	const decades = getDecades();

	const radio = (id: string, label: string, choices: Choice[]): Group => ({
		choices,
		id,
		label,
		type: "radio",
	});

	const columns = $derived<Group[][]>([
		filterGroups.map((group) =>
			radio(
				group.id,
				group.label,
				group.options.map((option) => ({
					checked: filters[group.id] === option.value,
					label: option.label,
					next: {
						[group.id]: option.value,
					},
				})),
			),
		),
		[
			radio(
				"decade",
				"Released",
				[undefined, ...(decades.current ?? [])].map((decade) => ({
					checked: filters.decade === decade,
					label: decade ? `${decade}s` : "All",
					next: {
						decade,
					},
				})),
			),
		],
		[
			radio(
				"length",
				"Length",
				[undefined, ...lengths].map((length) => ({
					checked: filters.length === length?.value,
					label: length?.label ?? "All",
					next: {
						length: length?.value,
					},
				})),
			),
			radio(
				"country",
				"Country",
				[undefined, ...countries].map((country) => ({
					checked: filters.country === country?.value,
					label: country?.label ?? "All",
					next: {
						country: country?.value,
					},
				})),
			),
		],
		[
			{
				choices: sources.map((source) => ({
					checked: filters.sources.includes(source.value),
					label: source.label,
					next: {
						sources: toggle(filters.sources, source.value),
					},
				})),
				id: "source",
				label: "Source",
				type: "checkbox",
			},
			{
				choices: [
					{
						checked: filters.hideMature,
						label: "Hide mature content",
						next: {
							hideMature: !filters.hideMature,
						},
					},
				],
				id: "content",
				label: "Content",
				type: "checkbox",
			},
		],
	]);
</script>

{#each columns as column, index (index)}
	<div class="min-w-0">
		{#each column as group (group.id)}
			<div
				role={group.type === "radio" ? "radiogroup" : "group"}
				aria-labelledby="{scope}-{group.id}"
			>
				<p id="{scope}-{group.id}" class="px-5 pt-3 pb-2 text-base font-bold text-foreground">
					{group.label}
				</p>
				{#each group.choices as choice (choice.label)}
					<FilterOption
						type={group.type}
						name="{scope}-{group.id}"
						label={choice.label}
						checked={choice.checked}
						onchange={() =>
							onchange({
								...filters,
								...choice.next,
							})}
					/>
				{/each}
			</div>
		{/each}
	</div>
{/each}
