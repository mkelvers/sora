<script lang="ts">
	import Input from "$lib/components/ui/input.svelte";
	import { toggle } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { BrowseFilters } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import { getStudios } from "$routes/(app)/(catalog)/catalog.remote";
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

	let query = $state("");
	let searched = $state("");

	$effect(() => {
		const next = query.trim();
		const timer = setTimeout(() => (searched = next), 200);
		return () => clearTimeout(timer);
	});

	const found = $derived(getStudios(searched));
	const studios = $derived([
		...filters.studios,
		...(found.current ?? []).filter((studio) => !filters.studios.includes(studio)),
	]);
</script>

<div class="px-5 pt-3 pb-2">
	<Input
		bind:value={query}
		type="search"
		placeholder="Search studios"
		aria-label="Search studios"
	/>
</div>

<div
	role="group"
	aria-label="Studios"
	class="sm:max-h-[min(60vh,32rem)] sm:scrollbar-thin sm:overflow-y-auto"
>
	{#each studios as studio (studio)}
		<FilterOption
			type="checkbox"
			name="{scope}-studio"
			label={studio}
			checked={filters.studios.includes(studio)}
			onchange={() =>
				onchange({
					...filters,
					studios: toggle(filters.studios, studio),
				})}
		/>
	{:else}
		{#if found.current}
			<p class="px-5 py-3 text-sm text-muted">No studios match “{searched}”.</p>
		{/if}
	{/each}
</div>
