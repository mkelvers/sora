<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Sheet from "$lib/components/ui/Sheet.svelte";
	import { cn } from "$lib/utils";
	import { filters } from "$routes/(app)/(catalog)/catalog.svelte";
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

	// Whether the "Sort By" sheet is open.
	let sorting = $state(false);
	// Whether the "Filter" sheet is open.
	let filtering = $state(false);
	const draft = $state<typeof filters>({});

	$effect(() => {
		if (filtering) {
			Object.assign(draft, {
				audio: filters.audio,
				format: filters.format,
			});
		}
	});

	const current = $derived(sorts.find((sort) => sort.kind === kind));
	const filtered = $derived(!!filters.audio || !!filters.format);
</script>

<div class="flex items-center gap-1 max-sm:hidden">
	{#if current}
		<Dropdown variant="toolbar" class="w-52" label="Sort anime, {current.label} selected">
			{#snippet trigger()}
				<ListBulletsIcon size="1.2rem" weight="bold" />
				<span class="max-sm:hidden">{current.label}</span>
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
							{@const checked = filters[group.id] === option.value}
							<Button
								role="menuitemradio"
								aria-checked={checked}
								onclick={() =>
									Object.assign(filters, {
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
	{#if current}
		<Button
			variant="ghost"
			class="size-11 px-0"
			aria-label="Sort anime, {current.label} selected"
			aria-haspopup="dialog"
			aria-controls="sort-list"
			onclick={() => (sorting = true)}
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
		onclick={() => (filtering = true)}
	>
		<FunnelIcon size="1.2rem" weight="bold" class={cn(filtered && "text-accent-secondary")} />
	</Button>
</div>

<Sheet bind:open={sorting} id="sort-list" title="Sort By">
	{#each sorts as sort (sort.kind)}
		<Button
			variant="item"
			href="/{sort.kind}"
			aria-current={sort.kind === kind ? "true" : undefined}
			class="aria-current:font-normal aria-current:text-foreground"
			onclick={() => (sorting = false)}
		>
			{sort.label}
		</Button>
	{/each}
</Sheet>

<Sheet bind:open={filtering} id="filter-list" title="Filter">
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
				Object.assign(filters, draft);
				filtering = false;
			}}
		>
			Update Filters
		</Button>
	{/snippet}
</Sheet>
