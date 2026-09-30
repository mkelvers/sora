<script lang="ts" module>
	import type { LibraryStatus } from "@sora/sdk";

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

	export const statuses = [
		{
			value: "watching",
			label: "Watching",
		},
		{
			value: "planning",
			label: "Planning",
		},
		{
			value: "completed",
			label: "Completed",
		},
	] as const satisfies readonly {
		value: LibraryStatus;
		label: string;
	}[];

	export type WatchlistSort = (typeof sorts)[number]["value"];
</script>

<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import { cn } from "$lib/utils";
	import { CircleIcon, FunnelIcon, ListBulletsIcon, RadioButtonIcon } from "phosphor-svelte";

	let {
		sort = $bindable(),
		status = $bindable(),
	}: {
		sort: WatchlistSort;
		status: LibraryStatus | undefined;
	} = $props();

	const selectedSort = $derived(sorts.find((option) => option.value === sort) ?? sorts[0]);

	const filters = [
		{
			value: undefined,
			label: "All",
		},
		...statuses,
	];
</script>

<div class="flex items-center gap-1">
	<Dropdown variant="toolbar" class="w-52" label="Sort watchlist, {selectedSort.label} selected">
		{#snippet trigger()}
			<ListBulletsIcon size="1.2rem" weight="bold" />
			<span class="max-sm:hidden">{selectedSort.label}</span>
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

	<Dropdown variant="toolbar" class="w-60" label="Filter watchlist">
		{#snippet trigger()}
			<FunnelIcon size="1.2rem" weight="bold" class={cn(status && "text-accent-secondary")} />
			<span class={cn("max-sm:hidden", status && "text-accent-secondary")}>Filter</span>
		{/snippet}

		{#snippet children()}
			<div role="menu" aria-label="Filter watchlist by status">
				{#each filters as option (option.label)}
					{@const checked = option.value === status}
					<Button
						role="menuitemradio"
						aria-checked={checked}
						onclick={() => (status = option.value)}
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
