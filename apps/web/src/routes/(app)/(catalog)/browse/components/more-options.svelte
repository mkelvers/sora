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

	const decades = getDecades();

	const groups = $derived([
		...filterGroups.map((group) => ({
			id: group.id,
			label: group.label,
			options: group.options.map((option) => ({
				label: option.label,
				next: {
					[group.id]: option.value,
				},
				selected: filters[group.id] === option.value,
			})),
		})),
		{
			id: "decade",
			label: "Released",
			options: [undefined, ...(decades.current ?? [])].map((decade) => ({
				label: decade ? `${decade}s` : "All",
				next: {
					decade,
				},
				selected: filters.decade === decade,
			})),
		},
		{
			id: "length",
			label: "Length",
			options: [undefined, ...lengths].map((length) => ({
				label: length?.label ?? "All",
				next: {
					length: length?.value,
				},
				selected: filters.length === length?.value,
			})),
		},
		{
			id: "country",
			label: "Country",
			options: [undefined, ...countries].map((country) => ({
				label: country?.label ?? "All",
				next: {
					country: country?.value,
				},
				selected: filters.country === country?.value,
			})),
		},
	]);
</script>

{#each groups as group (group.id)}
	<div role="radiogroup" aria-labelledby="{scope}-{group.id}">
		<p id="{scope}-{group.id}" class="px-5 pt-3 pb-2 text-base font-bold text-foreground">
			{group.label}
		</p>
		{#each group.options as option (option.label)}
			<FilterOption
				type="radio"
				name="{scope}-{group.id}"
				label={option.label}
				checked={option.selected}
				onchange={() =>
					onchange({
						...filters,
						...option.next,
					})}
			/>
		{/each}
	</div>
{/each}

<div role="group" aria-labelledby="{scope}-source">
	<p id="{scope}-source" class="px-5 pt-3 pb-2 text-base font-bold text-foreground">Source</p>
	{#each sources as source (source.value)}
		<FilterOption
			type="checkbox"
			name="{scope}-source"
			label={source.label}
			checked={filters.sources.includes(source.value)}
			onchange={() =>
				onchange({
					...filters,
					sources: toggle(filters.sources, source.value),
				})}
		/>
	{/each}
</div>

<div role="group" aria-labelledby="{scope}-content">
	<p id="{scope}-content" class="px-5 pt-3 pb-2 text-base font-bold text-foreground">Content</p>
	<FilterOption
		type="checkbox"
		name="{scope}-mature"
		label="Hide mature content"
		checked={filters.hideMature}
		onchange={() =>
			onchange({
				...filters,
				hideMature: !filters.hideMature,
			})}
	/>
</div>
