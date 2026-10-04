<script lang="ts" module>
	export const catalogFilters = $state<{
		audio?: "sub" | "dub";
		format?: "TV" | "MOVIE";
	}>({});
</script>

<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Sheet from "$lib/components/ui/Sheet.svelte";
	import { cn } from "$lib/utils";
	import { CircleIcon, FunnelIcon, ListBulletsIcon, RadioButtonIcon } from "phosphor-svelte";

	let {
		kind,
	}: {
		kind?: "new" | "popular";
	} = $props();

	const sorts = [
		{
			kind: "popular",
			label: "Popularity",
		},
		{
			kind: "new",
			label: "Newest",
		},
	] as const;

	const groups = [
		{
			id: "audio",
			label: "Language",
			options: [
				{
					label: "All",
					value: undefined,
				},
				{
					label: "Subtitled",
					value: "sub",
				},
				{
					label: "Dubbed",
					value: "dub",
				},
			],
		},
		{
			id: "format",
			label: "Media",
			options: [
				{
					label: "All",
					value: undefined,
				},
				{
					label: "Series",
					value: "TV",
				},
				{
					label: "Movies",
					value: "MOVIE",
				},
			],
		},
	] as const;

	let sortOpen = $state(false);
	let filterOpen = $state(false);
	const draft = $state<typeof catalogFilters>({});

	$effect(() => {
		if (filterOpen) {
			Object.assign(draft, {
				audio: catalogFilters.audio,
				format: catalogFilters.format,
			});
		}
	});

	const selectedSort = $derived(sorts.find((sort) => sort.kind === kind));
	const filtered = $derived(!!catalogFilters.audio || !!catalogFilters.format);
</script>

<div class="flex items-center gap-1 max-sm:hidden">
	{#if selectedSort}
		<Dropdown variant="toolbar" class="w-52" label="Sort anime, {selectedSort.label} selected">
			{#snippet trigger()}
				<ListBulletsIcon size="1.2rem" weight="bold" />
				<span class="max-sm:hidden">{selectedSort.label}</span>
			{/snippet}

			{#snippet children()}
				<div role="menu" aria-label="Sort anime">
					{#each sorts as sort (sort.kind)}
						<Button
							role="menuitemradio"
							aria-checked={sort.kind === kind}
							href="/{sort.kind}"
							variant="item"
						>
							{sort.label}
						</Button>
					{/each}
				</div>
			{/snippet}
		</Dropdown>
	{/if}

	<Dropdown variant="toolbar" class="w-60" label="Filter anime">
		{#snippet trigger()}
			<FunnelIcon size="1.2rem" weight="bold" class={cn(filtered && "text-accent-secondary")} />
			<span class={cn("max-sm:hidden", filtered && "text-accent-secondary")}>Filter</span>
		{/snippet}

		{#snippet children()}
			<div role="menu" aria-label="Filter anime">
				{#each groups as group (group.id)}
					<div role="group" aria-labelledby="filter-{group.id}">
						<p id="filter-{group.id}" class="px-5 pt-3 pb-2 text-base font-bold text-foreground">
							{group.label}
						</p>
						{#each group.options as option (option.label)}
							{@const checked = catalogFilters[group.id] === option.value}
							<Button
								role="menuitemradio"
								aria-checked={checked}
								onclick={() =>
									Object.assign(catalogFilters, {
										[group.id]: option.value,
									})}
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
				{/each}
			</div>
		{/snippet}
	</Dropdown>
</div>

<div class="flex items-center gap-1 sm:hidden">
	{#if selectedSort}
		<Button
			variant="ghost"
			class="size-11 px-0"
			aria-label="Sort anime, {selectedSort.label} selected"
			aria-haspopup="dialog"
			aria-controls="sort-list"
			onclick={() => (sortOpen = true)}
		>
			<ListBulletsIcon size="1.2rem" weight="bold" />
		</Button>
	{/if}
	<Button
		variant="ghost"
		class="size-11 px-0"
		aria-label="Filter anime"
		aria-haspopup="dialog"
		aria-controls="filter-list"
		onclick={() => (filterOpen = true)}
	>
		<FunnelIcon size="1.2rem" weight="bold" class={cn(filtered && "text-accent-secondary")} />
	</Button>
</div>

<Sheet bind:open={sortOpen} id="sort-list" title="Sort By" closeLabel="Close sort by">
	{#each sorts as sort (sort.kind)}
		<Button
			variant="item"
			href="/{sort.kind}"
			aria-current={sort.kind === kind ? "true" : undefined}
			class="aria-[current=true]:font-normal aria-[current=true]:text-foreground"
			onclick={() => (sortOpen = false)}
		>
			{sort.label}
		</Button>
	{/each}
</Sheet>

<Sheet bind:open={filterOpen} id="filter-list" title="Filter" closeLabel="Close filter">
	{#each groups as group (group.id)}
		<div role="radiogroup" aria-labelledby="filter-sheet-{group.id}">
			<p id="filter-sheet-{group.id}" class="px-5 pt-3 pb-2 text-base font-bold text-foreground">
				{group.label}
			</p>
			{#each group.options as option (option.label)}
				{@const checked = draft[group.id] === option.value}
				<Button
					role="radio"
					aria-checked={checked}
					onclick={() =>
						Object.assign(draft, {
							[group.id]: option.value,
						})}
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
	{/each}

	{#snippet footer()}
		<Button
			variant="outline"
			class="w-full"
			onclick={() => {
				Object.assign(catalogFilters, draft);
				filterOpen = false;
			}}
		>
			Update Filters
		</Button>
	{/snippet}
</Sheet>
