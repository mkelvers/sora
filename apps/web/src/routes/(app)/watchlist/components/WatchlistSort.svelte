<script lang="ts" module>
	import type { WatchlistEntry } from "@sora/sdk";

	export const sorts = [
		{
			label: "Last updated",
			compare: (left: WatchlistEntry, right: WatchlistEntry) =>
				right.updated_at.localeCompare(left.updated_at),
		},
		{
			label: "Date added",
			compare: (left: WatchlistEntry, right: WatchlistEntry) =>
				right.added_at.localeCompare(left.added_at),
		},
		{
			label: "Alphabetical",
			compare: (left: WatchlistEntry, right: WatchlistEntry) =>
				left.series.title.localeCompare(right.series.title),
		},
	];
</script>

<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import { ListBulletsIcon } from "phosphor-svelte";

	let {
		sort = $bindable(),
	}: {
		sort: (typeof sorts)[number];
	} = $props();
</script>

<Dropdown class="w-52" label="Sort watchlist, {sort.label} selected">
	{#snippet trigger()}
		<ListBulletsIcon size="1.2rem" weight="bold" />
		<span class="max-sm:hidden">{sort.label}</span>
	{/snippet}

	{#snippet children()}
		<div role="menu" aria-label="Sort watchlist">
			{#each sorts as option (option.label)}
				<Button
					role="menuitemradio"
					aria-checked={option === sort}
					onclick={() => (sort = option)}
					variant="item"
				>
					{option.label}
				</Button>
			{/each}
		</div>
	{/snippet}
</Dropdown>
