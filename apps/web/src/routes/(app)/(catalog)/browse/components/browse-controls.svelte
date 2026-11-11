<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import Dropdown from "$lib/components/ui/dropdown.svelte";
	import Sheet from "$lib/components/ui/sheet.svelte";
	import { cn } from "$lib/utils";
	import { browseHref, noFilters, sorts } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { BrowseFilters } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import { FunnelIcon, ListBulletsIcon } from "phosphor-svelte";

	import FilterOptions from "./filter-options.svelte";

	let {
		filters,
		onchange,
	}: {
		filters: BrowseFilters;
		onchange: (next: BrowseFilters) => void;
	} = $props();

	let sorting = $state(false);
	let filtering = $state(false);
	let draft = $state<BrowseFilters>(noFilters);

	const current = $derived(sorts.find((sort) => sort.value === filters.sort) ?? sorts[0]);
	const filtered = $derived(
		!!filters.audio ||
			!!filters.format ||
			filters.decade !== undefined ||
			!!filters.length ||
			!!filters.country ||
			filters.sources.length > 0 ||
			filters.hideMature,
	);
</script>

<div class="flex items-center gap-1 max-sm:hidden">
	<Dropdown variant="toolbar" class="w-52" label="Sort anime, {current.label} selected">
		{#snippet trigger()}
			<ListBulletsIcon size="1.2rem" weight="bold" />
			{current.label}
		{/snippet}

		{#snippet children()}
			<div role="menu" aria-label="Sort anime">
				{#each sorts as sort (sort.value)}
					<Button
						role="menuitemradio"
						aria-checked={sort.value === filters.sort}
						href={browseHref({
							...filters,
							sort: sort.value,
						})}
						variant="item"
					>
						{sort.label}
					</Button>
				{/each}
			</div>
		{/snippet}
	</Dropdown>

	<Dropdown
		variant="toolbar"
		class="max-h-[calc(100dvh-10rem)] w-[min(52rem,calc(100vw-2rem))] scrollbar-thin overflow-y-auto"
		label="Filter anime"
	>
		{#snippet trigger()}
			<FunnelIcon size="1.2rem" weight="bold" class={cn(filtered && "text-accent-secondary")} />
			<span class={cn(filtered && "text-accent-secondary")}>Filter</span>
		{/snippet}

		{#snippet children()}
			<div role="group" aria-label="Filter anime" class="grid grid-cols-2 py-2 lg:grid-cols-4">
				<FilterOptions {filters} {onchange} scope="menu" />
			</div>
		{/snippet}
	</Dropdown>
</div>

<div class="flex items-center gap-1 sm:hidden">
	<Button
		variant="icon"
		aria-label="Sort anime, {current.label} selected"
		aria-haspopup="dialog"
		aria-controls="browse-sort"
		onclick={() => (sorting = true)}
	>
		<ListBulletsIcon size="1.2rem" weight="bold" />
	</Button>
	<Button
		variant="icon"
		aria-label="Filter anime"
		aria-haspopup="dialog"
		aria-controls="browse-filter"
		onclick={() => {
			draft = {
				...filters,
			};
			filtering = true;
		}}
	>
		<FunnelIcon size="1.2rem" weight="bold" class={cn(filtered && "text-accent-secondary")} />
	</Button>
</div>

<Sheet bind:open={sorting} id="browse-sort" title="Sort By">
	{#each sorts as sort (sort.value)}
		<Button
			variant="item"
			href={browseHref({
				...filters,
				sort: sort.value,
			})}
			aria-current={sort.value === filters.sort ? "true" : undefined}
			onclick={() => (sorting = false)}
		>
			{sort.label}
		</Button>
	{/each}
</Sheet>

<Sheet bind:open={filtering} id="browse-filter" title="Filter">
	<FilterOptions filters={draft} onchange={(next) => (draft = next)} scope="sheet" />

	{#snippet footer()}
		<Button
			variant="primary"
			class="w-full"
			onclick={() => {
				onchange(draft);
				filtering = false;
			}}
		>
			Apply Filters
		</Button>
	{/snippet}
</Sheet>
