<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import Dropdown from "$lib/components/ui/dropdown.svelte";
	import Sheet from "$lib/components/ui/sheet.svelte";
	import { cn } from "$lib/utils";
	import { browseHref, sorts } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { BrowseFilters } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { Tag } from "@sora/sdk";
	import { FunnelIcon, ListBulletsIcon } from "phosphor-svelte";

	import FilterList from "./filter-list.svelte";

	let {
		filters,
		genres,
		tags,
		onchange,
	}: {
		filters: BrowseFilters;
		genres: string[];
		tags: Tag[];
		onchange: (next: BrowseFilters) => void;
	} = $props();

	let sorting = $state(false);
	let filtering = $state(false);
	let draft = $state<BrowseFilters>({
		genres: [],
		hideMature: false,
		sort: "popular",
		sources: [],
		studios: [],
		tags: [],
	});

	const current = $derived(sorts.find((sort) => sort.value === filters.sort) ?? sorts[0]);
	const filtered = $derived(
		filters.genres.length > 0 ||
			filters.tags.length > 0 ||
			filters.studios.length > 0 ||
			filters.sources.length > 0 ||
			!!filters.audio ||
			!!filters.format ||
			!!filters.country ||
			filters.hideMature,
	);
</script>

<div class="max-lg:hidden">
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
</div>

<div class="flex items-center gap-1 lg:hidden">
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
	<div class="grid gap-6 px-3">
		<FilterList filters={draft} {genres} {tags} onchange={(next) => (draft = next)} />
	</div>

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
