<script lang="ts" module>
	export const sorts = [
		{
			value: "recent",
			label: "Recent Activity",
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

	export const filters = [
		{
			value: "unstarted",
			label: "Not Started",
		},
		{
			value: "dropped",
			label: "Dropped",
		},
	] as const;

	export type ShowsSort = (typeof sorts)[number]["value"];
	export type ShowsFilter = (typeof filters)[number]["value"];
</script>

<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import { cn } from "$lib/utils";
	import { CircleIcon, FunnelIcon, ListBulletsIcon, RadioButtonIcon } from "phosphor-svelte";

	let {
		sort = $bindable(),
		filter = $bindable(),
	}: {
		sort: ShowsSort;
		filter: ShowsFilter | undefined;
	} = $props();

	const selectedSort = $derived(sorts.find((option) => option.value === sort) ?? sorts[0]);

	const options = [
		{
			value: undefined,
			label: "All",
		},
		...filters,
	];
</script>

<div class="flex items-center gap-1">
	<Dropdown variant="toolbar" class="w-52" label="Sort shows, {selectedSort.label} selected">
		{#snippet trigger()}
			<ListBulletsIcon size="1.2rem" weight="bold" />
			<span class="max-sm:hidden">{selectedSort.label}</span>
		{/snippet}

		{#snippet children()}
			<div role="menu" aria-label="Sort shows">
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

	<Dropdown variant="toolbar" class="w-60" label="Filter shows">
		{#snippet trigger()}
			<FunnelIcon size="1.2rem" weight="bold" class={cn(filter && "text-accent-secondary")} />
			<span class={cn("max-sm:hidden", filter && "text-accent-secondary")}>Filter</span>
		{/snippet}

		{#snippet children()}
			<div role="menu" aria-label="Filter shows">
				{#each options as option (option.label)}
					{@const checked = option.value === filter}
					<Button
						role="menuitemradio"
						aria-checked={checked}
						onclick={() => (filter = option.value)}
						variant="item"
						class="gap-2.5"
					>
						{#if checked}
							<RadioButtonIcon size="1.25rem" weight="fill" class="text-accent-secondary" />
						{:else}
							<CircleIcon size="1.25rem" />
						{/if}
						{option.label}
					</Button>
				{/each}
			</div>
		{/snippet}
	</Dropdown>
</div>
