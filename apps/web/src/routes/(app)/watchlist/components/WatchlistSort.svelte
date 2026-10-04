<script lang="ts" module>
	export const sorts = [
		{
			value: "updated",
			label: "Last Updated",
		},
		{
			value: "added",
			label: "Date Added",
		},
		{
			value: "title",
			label: "Alphabetical",
		},
	] as const;

	export type WatchlistSort = (typeof sorts)[number]["value"];
</script>

<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import { ListBulletsIcon } from "phosphor-svelte";

	let {
		sort = $bindable(),
	}: {
		sort: WatchlistSort;
	} = $props();

	const selected = $derived(sorts.find((option) => option.value === sort) ?? sorts[0]);
</script>

<Dropdown variant="toolbar" class="w-52" label="Sort watchlist, {selected.label} selected">
	{#snippet trigger()}
		<ListBulletsIcon size="1.2rem" weight="bold" />
		<span class="max-sm:hidden">{selected.label}</span>
	{/snippet}

	{#snippet children()}
		<div role="menu" aria-label="Sort watchlist">
			{#each sorts as option (option.value)}
				<Button
					role="menuitemradio"
					aria-checked={option.value === sort}
					onclick={() => (sort = option.value)}
					variant="item"
				>
					{option.label}
				</Button>
			{/each}
		</div>
	{/snippet}
</Dropdown>
