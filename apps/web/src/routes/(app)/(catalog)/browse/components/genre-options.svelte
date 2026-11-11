<script lang="ts">
	import { toggle } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { BrowseFilters } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import { getGenres } from "$routes/(app)/(catalog)/catalog.remote";
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

	const genres = getGenres();
</script>

<div role="group" aria-label="Genres" class="grid sm:grid-cols-2">
	{#each genres.current ?? [] as genre (genre)}
		<FilterOption
			type="checkbox"
			name="{scope}-genre"
			label={genre}
			checked={filters.genres.includes(genre)}
			onchange={() =>
				onchange({
					...filters,
					genres: toggle(filters.genres, genre),
				})}
		/>
	{/each}
</div>
