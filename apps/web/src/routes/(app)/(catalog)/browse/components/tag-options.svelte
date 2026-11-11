<script lang="ts">
	import Input from "$lib/components/ui/input.svelte";
	import { tagGroups, toggle } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { BrowseFilters } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import { getTags } from "$routes/(app)/(catalog)/catalog.remote";
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

	const tags = getTags();

	let query = $state("");

	const groups = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		const found = (tags.current ?? []).filter((tag) => tag.name.toLowerCase().includes(needle));
		return tagGroups
			.map((group) => ({
				...group,
				sections: [
					...Map.groupBy(
						found.filter((tag) => tag.group === group.value),
						(tag) => tag.section,
					),
				],
			}))
			.filter((group) => group.sections.length);
	});
</script>

<div class="px-5 pt-3 pb-2">
	<Input bind:value={query} type="search" placeholder="Search tags" aria-label="Search tags" />
</div>

<div class="sm:max-h-[min(60vh,32rem)] sm:scrollbar-thin sm:overflow-y-auto">
	{#each groups as group (group.value)}
		<div role="group" aria-labelledby="{scope}-tags-{group.value}">
			<p id="{scope}-tags-{group.value}" class="px-5 pt-3 pb-2 text-base font-bold text-foreground">
				{group.label}
			</p>
			{#each group.sections as [section, entries] (section)}
				{#if group.value !== "demographic"}
					<p class="px-5 pt-2 pb-1 text-sm text-subtle">{section}</p>
				{/if}
				{#each entries as tag (tag.name)}
					<FilterOption
						type="checkbox"
						name="{scope}-tag"
						label={tag.name}
						checked={filters.tags.includes(tag.name)}
						onchange={() =>
							onchange({
								...filters,
								tags: toggle(filters.tags, tag.name),
							})}
					/>
				{/each}
			{/each}
		</div>
	{:else}
		<p class="px-5 py-3 text-sm text-muted">No tags match “{query.trim()}”.</p>
	{/each}
</div>
