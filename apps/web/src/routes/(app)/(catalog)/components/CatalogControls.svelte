<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Sheet from "$lib/components/ui/Sheet.svelte";
	import { cn } from "$lib/utils";
	import {
		filterGroups,
		filters,
		type CatalogFilters,
	} from "$routes/(app)/(catalog)/catalog.svelte";
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

	let sorting = $state(false);
	let filtering = $state(false);
	let draft = $state<CatalogFilters>({});

	const current = $derived(sorts.find((sort) => sort.kind === kind));
	const filtered = $derived(!!filters.audio || !!filters.format);
</script>

{#snippet radio(
	role: "menuitemradio" | "radio",
	checked: boolean,
	label: string,
	onclick: () => void,
)}
	<Button {role} aria-checked={checked} {onclick} variant="item" class="gap-2.5">
		{#if checked}
			<RadioButtonIcon size="1.25rem" weight="fill" class="text-accent-secondary" />
		{:else}
			<CircleIcon size="1.25rem" />
		{/if}
		{label}
	</Button>
{/snippet}

<div class="flex items-center gap-1 max-sm:hidden">
	{#if current}
		<Dropdown variant="toolbar" class="w-52" label="Sort anime, {current.label} selected">
			{#snippet trigger()}
				<ListBulletsIcon size="1.2rem" weight="bold" />
				{current.label}
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
			<span class={cn(filtered && "text-accent-secondary")}>Filter</span>
		{/snippet}

		{#snippet children()}
			<div role="menu" aria-label="Filter anime">
				{#each filterGroups as group (group.id)}
					<div role="group" aria-labelledby="filter-{group.id}">
						<p id="filter-{group.id}" class="px-5 pt-3 pb-2 text-base font-bold text-foreground">
							{group.label}
						</p>
						{#each group.options as option (option.label)}
							{@render radio(
								"menuitemradio",
								filters[group.id] === option.value,
								option.label,
								() =>
									Object.assign(filters, {
										[group.id]: option.value,
									}),
							)}
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
			variant="icon"
			aria-label="Sort anime, {current.label} selected"
			aria-haspopup="dialog"
			aria-controls="sort-list"
			onclick={() => (sorting = true)}
		>
			<ListBulletsIcon size="1.2rem" weight="bold" />
		</Button>
	{/if}
	<Button
		variant="icon"
		aria-label="Filter anime"
		aria-haspopup="dialog"
		aria-controls="filter-list"
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

<Sheet bind:open={sorting} id="sort-list" title="Sort By">
	{#each sorts as sort (sort.kind)}
		<Button
			variant="item"
			href="/{sort.kind}"
			aria-current={sort.kind === kind ? "true" : undefined}
			onclick={() => (sorting = false)}
		>
			{sort.label}
		</Button>
	{/each}
</Sheet>

<Sheet bind:open={filtering} id="filter-list" title="Filter">
	{#each filterGroups as group (group.id)}
		<div role="radiogroup" aria-labelledby="filter-sheet-{group.id}">
			<p id="filter-sheet-{group.id}" class="px-5 pt-3 pb-2 text-base font-bold text-foreground">
				{group.label}
			</p>
			{#each group.options as option (option.label)}
				{@render radio("radio", draft[group.id] === option.value, option.label, () =>
					Object.assign(draft, {
						[group.id]: option.value,
					}),
				)}
			{/each}
		</div>
	{/each}

	{#snippet footer()}
		<Button
			variant="primary"
			class="w-full"
			onclick={() => {
				Object.assign(filters, draft);
				filtering = false;
			}}
		>
			Apply Filters
		</Button>
	{/snippet}
</Sheet>
